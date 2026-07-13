import hashlib
import os
import re
import struct
import uuid
import zlib
from typing import Any, Dict, List, Tuple

from fastapi import HTTPException

from app.core.media import sanitize_export_filename


FBX_BINARY_HEADER = b"Kaydara FBX Binary  \x00\x1a\x00"
VNCCS_TARGET_MODEL_HEIGHT = 17.35
SAM3D_CANONICAL_JOINT_NAMES = {
    1: "Root",
    2: "thigh_l",
    3: "calf_l",
    4: "foot_l",
    8: "ball_l",
    18: "thigh_r",
    19: "calf_r",
    20: "foot_r",
    24: "ball_r",
    34: "pelvis",
    35: "spine_01",
    36: "spine_02",
    37: "spine_03",
    38: "clavicle_r",
    39: "upperarm_r",
    40: "lowerarm_r",
    42: "hand_r",
    43: "pinky_01_r",
    44: "pinky_02_r",
    45: "pinky_03_r",
    48: "ring_01_r",
    49: "ring_02_r",
    50: "ring_03_r",
    52: "middle_01_r",
    53: "middle_02_r",
    54: "middle_03_r",
    56: "index_01_r",
    57: "index_02_r",
    58: "index_03_r",
    60: "thumb_01_r",
    61: "thumb_02_r",
    62: "thumb_03_r",
    74: "clavicle_l",
    75: "upperarm_l",
    76: "lowerarm_l",
    78: "hand_l",
    79: "pinky_01_l",
    80: "pinky_02_l",
    81: "pinky_03_l",
    84: "ring_01_l",
    85: "ring_02_l",
    86: "ring_03_l",
    88: "middle_01_l",
    89: "middle_02_l",
    90: "middle_03_l",
    92: "index_01_l",
    93: "index_02_l",
    94: "index_03_l",
    96: "thumb_01_l",
    97: "thumb_02_l",
    98: "thumb_03_l",
    110: "neck_01",
    113: "head",
}
SAM3D_VISIBLE_MARKER_JOINTS = {
    1, 2, 3, 4, 8,
    18, 19, 20, 24,
    34, 35, 36, 37, 38, 40, 42,
    44, 45, 46, 48, 49, 50, 52, 53, 54, 56, 57, 58, 61, 62, 63, 70,
    74, 76, 78,
    80, 81, 82, 84, 85, 86, 88, 89, 90, 92, 93, 94, 97, 98, 99, 106,
    111, 113,
}
VNCCS_GAME_ENGINE_BONE_NAMES = {
    "Root",
    "ball_l", "ball_r",
    "calf_l", "calf_r",
    "clavicle_l", "clavicle_r",
    "foot_l", "foot_r",
    "hand_l", "hand_r",
    "head",
    "index_01_l", "index_01_r",
    "index_02_l", "index_02_r",
    "index_03_l", "index_03_r",
    "lowerarm_l", "lowerarm_r",
    "middle_01_l", "middle_01_r",
    "middle_02_l", "middle_02_r",
    "middle_03_l", "middle_03_r",
    "neck_01",
    "pelvis",
    "pinky_01_l", "pinky_01_r",
    "pinky_02_l", "pinky_02_r",
    "pinky_03_l", "pinky_03_r",
    "ring_01_l", "ring_01_r",
    "ring_02_l", "ring_02_r",
    "ring_03_l", "ring_03_r",
    "spine_01", "spine_02", "spine_03",
    "thigh_l", "thigh_r",
    "thumb_01_l", "thumb_01_r",
    "thumb_02_l", "thumb_02_r",
    "thumb_03_l", "thumb_03_r",
    "upperarm_l", "upperarm_r",
}


def _fbx_name(value: str) -> str:
    return str(value or "Node").replace("\\", "_").replace('"', "_").replace(":", "_")


def _sam3d_joint_index_from_name(name: Any) -> int | None:
    match = re.search(r"joint[\s_.-]?(\d+)$", str(name or ""), re.I)
    return int(match.group(1)) if match else None


def _annotate_sam3d_bone_semantics(model: Dict[str, Any]) -> Dict[str, Any]:
    bones = model.get("bones") or []
    mapped = 0
    mapped_names = set()
    for bone in bones:
        joint_index = _sam3d_joint_index_from_name(bone.get("name"))
        semantic_name = SAM3D_CANONICAL_JOINT_NAMES.get(joint_index)
        if semantic_name:
            bone["semanticName"] = semantic_name
            mapped += 1
            mapped_names.add(semantic_name)
        if joint_index in SAM3D_VISIBLE_MARKER_JOINTS:
            bone["showMarker"] = True
    if mapped:
        model["sam3d_semantic_map"] = "vnccs_mhr_forward_canonical"
        model["sam3d_semantic_count"] = mapped
        model["sam3d_marker_map"] = "manual_selected_joints"
        model["sam3d_marker_count"] = sum(1 for bone in bones if bone.get("showMarker"))
        if VNCCS_GAME_ENGINE_BONE_NAMES.issubset(mapped_names):
            model["sam3d_semantic_map"] = "vnccs_game_engine_display_53"
    return model


def _numbers_from_text(text: str) -> List[float]:
    return [float(item) for item in re.findall(r"[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?", text or "")]


def _extract_fbx_blocks(text: str, block_name: str):
    pattern = re.compile(rf"(?m)^[ \t]*{re.escape(block_name)}\s*:[^{{]*\{{")
    for match in pattern.finditer(text):
        open_pos = text.find("{", match.start(), match.end())
        if open_pos < 0:
            continue
        depth = 0
        close_pos = -1
        for pos in range(open_pos, len(text)):
            char = text[pos]
            if char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    close_pos = pos
                    break
        if close_pos < 0:
            continue
        yield text[match.start():open_pos].strip(), text[open_pos + 1:close_pos]


def _parse_fbx_array(block: str, key: str) -> List[float]:
    match = re.search(rf"{re.escape(key)}\s*:\s*\*\d+\s*\{{\s*a\s*:\s*(.*?)\s*\}}", block, re.S)
    if not match:
        return []
    return _numbers_from_text(match.group(1))


def _parse_fbx_polygon_indices(values: List[float]) -> List[int]:
    indices: List[int] = []
    polygon: List[int] = []
    for value in values:
        raw = int(value)
        end = raw < 0
        idx = -raw - 1 if end else raw
        polygon.append(idx)
        if end:
            if len(polygon) >= 3:
                for i in range(1, len(polygon) - 1):
                    indices.extend([polygon[0], polygon[i], polygon[i + 1]])
            polygon = []
    return indices


def _parse_fbx_lcl_translation(block: str) -> List[float]:
    return _parse_fbx_lcl_vec3(block, "Lcl Translation", [0.0, 0.0, 0.0])


def _parse_fbx_lcl_rotation(block: str) -> List[float]:
    return _parse_fbx_lcl_vec3(block, "Lcl Rotation", [0.0, 0.0, 0.0])


def _parse_fbx_lcl_scaling(block: str) -> List[float]:
    return _parse_fbx_lcl_vec3(block, "Lcl Scaling", [1.0, 1.0, 1.0])


def _parse_fbx_lcl_vec3(block: str, property_name: str, default: List[float]) -> List[float]:
    for line in block.splitlines():
        if f'"{property_name}"' in line:
            nums = _numbers_from_text(line)
            if len(nums) >= 3:
                return [float(nums[-3]), float(nums[-2]), float(nums[-1])]
    return list(default)


def _parse_fbx_size(block: str) -> float:
    for line in block.splitlines():
        if '"Size"' in line:
            nums = _numbers_from_text(line)
            if nums:
                return float(nums[-1])
    return 1.0


def _read_cstring(content: bytes, offset: int) -> Tuple[str, int]:
    end = content.find(b"\x00", offset)
    if end < 0:
        return "", len(content)
    try:
        return content[offset:end].decode("utf-8", "replace"), end + 1
    except Exception:
        return "", end + 1


def _read_fbx_string(value: bytes) -> str:
    return value.decode("utf-8", "replace") if isinstance(value, (bytes, bytearray)) else str(value or "")


def _read_fbx_binary_array(content: bytes, offset: int, type_code: str) -> Tuple[List[float], int]:
    if offset + 12 > len(content):
        return [], len(content)
    count, encoding, byte_length = struct.unpack_from("<III", content, offset)
    offset += 12
    raw = content[offset:offset + byte_length]
    offset += byte_length
    if encoding == 1:
        try:
            raw = zlib.decompress(raw)
        except Exception as exc:
            raise HTTPException(status_code=400, detail="FBX 数组压缩数据无法解压") from exc
    elif encoding != 0:
        raise HTTPException(status_code=400, detail=f"不支持的 FBX 数组编码：{encoding}")

    type_map = {
        "f": ("<f", 4, float),
        "d": ("<d", 8, float),
        "i": ("<i", 4, int),
        "l": ("<q", 8, int),
        "b": ("<?", 1, bool),
    }
    fmt, size, caster = type_map[type_code]
    expected = int(count) * size
    if len(raw) < expected:
        raise HTTPException(status_code=400, detail="FBX 数组数据长度不完整")
    unpack_fmt = "<" + fmt[1:] * int(count)
    values = struct.unpack_from(unpack_fmt, raw, 0) if count else ()
    return [caster(v) for v in values], offset


def _read_fbx_property(content: bytes, offset: int) -> Tuple[Any, int]:
    if offset >= len(content):
        return None, offset
    code = chr(content[offset])
    offset += 1
    scalar_types = {
        "Y": ("<h", 2),
        "C": ("<?", 1),
        "I": ("<i", 4),
        "F": ("<f", 4),
        "D": ("<d", 8),
        "L": ("<q", 8),
    }
    if code in scalar_types:
        fmt, size = scalar_types[code]
        if offset + size > len(content):
            return None, len(content)
        return struct.unpack_from(fmt, content, offset)[0], offset + size
    if code in {"f", "d", "i", "l", "b"}:
        return _read_fbx_binary_array(content, offset, code)
    if code in {"S", "R"}:
        if offset + 4 > len(content):
            return b"", len(content)
        length = struct.unpack_from("<I", content, offset)[0]
        offset += 4
        return content[offset:offset + length], offset + length
    raise HTTPException(status_code=400, detail=f"不支持的 FBX 属性类型：{code}")


def _fbx_node_record_size(version: int) -> Tuple[str, int]:
    return ("<QQQB", 25) if version >= 7500 else ("<IIIB", 13)


def _parse_fbx_binary_nodes(content: bytes) -> List[Dict[str, Any]]:
    if not content.startswith(FBX_BINARY_HEADER):
        raise HTTPException(status_code=400, detail="不是二进制 FBX 文件")
    if len(content) < 27:
        raise HTTPException(status_code=400, detail="FBX 文件头不完整")
    version = struct.unpack_from("<I", content, 23)[0]
    fmt, record_size = _fbx_node_record_size(version)

    def parse_nodes(offset: int, end_offset: int) -> Tuple[List[Dict[str, Any]], int]:
        nodes: List[Dict[str, Any]] = []
        while offset + record_size <= min(end_offset, len(content)):
            record = struct.unpack_from(fmt, content, offset)
            offset += record_size
            node_end = int(record[0])
            prop_count = int(record[1])
            prop_list_len = int(record[2])
            name_len = int(record[3])
            if node_end == 0 and prop_count == 0 and prop_list_len == 0 and name_len == 0:
                break
            if name_len < 0 or offset + name_len > len(content):
                raise HTTPException(status_code=400, detail="FBX 节点名称长度异常")
            name = content[offset:offset + name_len].decode("utf-8", "replace")
            offset += name_len
            props = []
            for _ in range(prop_count):
                prop, offset = _read_fbx_property(content, offset)
                props.append(prop)
            child_end = max(offset, min(node_end, len(content)))
            children, child_offset = parse_nodes(offset, child_end)
            offset = max(child_offset, child_end)
            nodes.append({"name": name, "props": props, "children": children})
        return nodes, offset

    nodes, _ = parse_nodes(27, len(content))
    return nodes


def _walk_fbx_nodes(nodes: List[Dict[str, Any]], name: str):
    for node in nodes:
        if node.get("name") == name:
            yield node
        yield from _walk_fbx_nodes(node.get("children") or [], name)


def _fbx_child(node: Dict[str, Any], name: str) -> Dict[str, Any] | None:
    for child in node.get("children") or []:
        if child.get("name") == name:
            return child
    return None


def _fbx_property_value(model_node: Dict[str, Any], property_name: str):
    props70 = _fbx_child(model_node, "Properties70")
    if not props70:
        return None
    for prop_node in props70.get("children") or []:
        if prop_node.get("name") != "P":
            continue
        props = prop_node.get("props") or []
        if not props:
            continue
        if _read_fbx_string(props[0]) == property_name:
            return props[-3:] if property_name in {"Lcl Translation", "Lcl Rotation", "Lcl Scaling"} and len(props) >= 3 else props[-1]
    return None


def _model_name_from_binary_prop(value: Any, fallback: str) -> str:
    raw = _read_fbx_string(value)
    if "\x00\x01" in raw:
        raw = raw.split("\x00\x01", 1)[0]
    if "::" in raw:
        raw = raw.split("::", 1)[1]
    return _fbx_name(raw or fallback)


def _parse_binary_fbx_model(content: bytes) -> Dict[str, Any]:
    nodes = _parse_fbx_binary_nodes(content)
    vertices: List[float] = []
    indices: List[int] = []
    geometry_id = None

    for geometry in _walk_fbx_nodes(nodes, "Geometry"):
        props = geometry.get("props") or []
        geom_type = _read_fbx_string(props[2]) if len(props) >= 3 else ""
        if geom_type != "Mesh":
            continue
        try:
            geometry_id = int(props[0])
        except Exception:
            geometry_id = None
        vertices_node = _fbx_child(geometry, "Vertices")
        polygon_node = _fbx_child(geometry, "PolygonVertexIndex")
        if not vertices_node or not polygon_node:
            continue
        vertices = [float(v) for v in (vertices_node.get("props") or [[]])[0]]
        poly_values = [int(v) for v in (polygon_node.get("props") or [[]])[0]]
        indices = _parse_fbx_polygon_indices(poly_values)
        if vertices and indices:
            break

    if not vertices or not indices:
        raise HTTPException(status_code=400, detail="FBX 中未找到可用 Mesh 顶点和面数据")
    if len(vertices) // 3 > 250000:
        raise HTTPException(status_code=400, detail="FBX 顶点数过大，当前最多支持 250000 个顶点")

    models: Dict[int, Dict[str, Any]] = {}
    for model in _walk_fbx_nodes(nodes, "Model"):
        props = model.get("props") or []
        if len(props) < 3:
            continue
        try:
            model_id = int(props[0])
        except Exception:
            continue
        name = _model_name_from_binary_prop(props[1], f"bone_{model_id}")
        model_type = _read_fbx_string(props[2])
        translation = _fbx_property_value(model, "Lcl Translation") or [0.0, 0.0, 0.0]
        if not isinstance(translation, list):
            translation = [0.0, 0.0, 0.0]
        rotation = _fbx_property_value(model, "Lcl Rotation") or [0.0, 0.0, 0.0]
        if not isinstance(rotation, list):
            rotation = [0.0, 0.0, 0.0]
        scaling = _fbx_property_value(model, "Lcl Scaling") or [1.0, 1.0, 1.0]
        if not isinstance(scaling, list):
            scaling = [1.0, 1.0, 1.0]
        size = _fbx_property_value(model, "Size")
        models[model_id] = {
            "id": model_id,
            "name": name,
            "type": model_type,
            "translation": [float(v) for v in translation[-3:]] if len(translation) >= 3 else [0.0, 0.0, 0.0],
            "rotation": [float(v) for v in rotation[-3:]] if len(rotation) >= 3 else [0.0, 0.0, 0.0],
            "scaling": [float(v) for v in scaling[-3:]] if len(scaling) >= 3 else [1.0, 1.0, 1.0],
            "length": float(size) if isinstance(size, (int, float)) else 1.0,
        }

    oo_connections: List[Tuple[int, int]] = []
    parent_by_child: Dict[int, int] = {}
    children_by_parent: Dict[int, List[int]] = {}
    for connection in _walk_fbx_nodes(nodes, "C"):
        props = connection.get("props") or []
        if len(props) >= 3 and _read_fbx_string(props[0]) == "OO":
            try:
                child_id = int(props[1])
                parent_id = int(props[2])
                oo_connections.append((child_id, parent_id))
                if child_id in models and parent_id in models:
                    parent_by_child[child_id] = parent_id
                children_by_parent.setdefault(parent_id, []).append(child_id)
            except Exception:
                continue

    mesh_model_id = next((parent_id for child_id, parent_id in oo_connections if child_id == geometry_id and parent_id in models), None) if geometry_id is not None else None
    if mesh_model_id in models:
        vertices = _apply_matrix_to_vertices(vertices, _global_model_matrix(mesh_model_id, models, parent_by_child))

    bone_types = {"LimbNode", "Skeleton", "Null"}
    bone_models = {
        mid: item for mid, item in models.items()
        if item.get("type") in bone_types
        and item.get("name") not in {"GeneratedRigMesh", "RootNode", "SceneRoot"}
        and mid != mesh_model_id
    }
    if not bone_models:
        raise HTTPException(status_code=400, detail="FBX 中未找到骨骼节点，无法作为姿态编辑人偶加载")

    bone_parent_by_child = {
        child_id: parent_id
        for child_id, parent_id in oo_connections
        if child_id in bone_models and parent_id in bone_models
    }

    bind_pose_matrices: Dict[int, List[List[float]]] = {}
    for pose in _walk_fbx_nodes(nodes, "Pose"):
        props = pose.get("props") or []
        pose_type = _read_fbx_string(props[2]) if len(props) >= 3 else ""
        if pose_type and pose_type != "BindPose":
            continue
        for pose_node in pose.get("children") or []:
            if pose_node.get("name") != "PoseNode":
                continue
            node = _fbx_child(pose_node, "Node")
            matrix_node = _fbx_child(pose_node, "Matrix")
            if not node or not matrix_node:
                continue
            node_props = node.get("props") or []
            matrix_props = matrix_node.get("props") or []
            if not node_props or not matrix_props:
                continue
            matrix = _matrix_from_fbx_values(matrix_props[0])
            if matrix:
                bind_pose_matrices[int(node_props[0])] = matrix

    cluster_matrices: Dict[int, List[List[float]]] = {}
    cluster_weights: Dict[str, Dict[str, List[float]]] = {}
    for deformer in _walk_fbx_nodes(nodes, "Deformer"):
        props = deformer.get("props") or []
        if len(props) < 3 or _read_fbx_string(props[2]) != "Cluster":
            continue
        try:
            cluster_id = int(props[0])
        except Exception:
            continue
        link_model_id = next((child_id for child_id in children_by_parent.get(cluster_id, []) if child_id in bone_models), None)
        if link_model_id is None:
            continue
        bone_name = bone_models[link_model_id]["name"]
        indexes_node = _fbx_child(deformer, "Indexes")
        weights_node = _fbx_child(deformer, "Weights")
        index_props = indexes_node.get("props") if indexes_node else None
        weight_props = weights_node.get("props") if weights_node else None
        if index_props and weight_props:
            cluster_weights[bone_name] = {
                "indices": [int(v) for v in (index_props[0] or [])],
                "weights": [float(v) for v in (weight_props[0] or [])],
            }
        link_node = _fbx_child(deformer, "TransformLink")
        link_props = link_node.get("props") if link_node else None
        if not link_props:
            continue
        matrix = _matrix_from_fbx_values(link_props[0])
        if matrix:
            cluster_matrices[link_model_id] = matrix

    def absolute_head(model_id: int, visiting=None) -> List[float]:
        if model_id in bind_pose_matrices:
            return _matrix_translation(bind_pose_matrices[model_id])
        if model_id in cluster_matrices:
            return _matrix_translation(cluster_matrices[model_id])
        return _apply_matrix([0.0, 0.0, 0.0], _global_model_matrix(model_id, models, parent_by_child, visiting))

    children: Dict[int, List[int]] = {}
    for child_id, parent_id in bone_parent_by_child.items():
        children.setdefault(parent_id, []).append(child_id)

    bones: List[Dict[str, Any]] = []
    for model_id, item in bone_models.items():
        head = absolute_head(model_id)
        child_heads = [absolute_head(child_id) for child_id in children.get(model_id, [])]
        tail = child_heads[0] if child_heads else [head[0], head[1] + float(item.get("length") or 1.0), head[2]]
        parent_id = bone_parent_by_child.get(model_id)
        bones.append({
            "name": item["name"],
            "headPos": head,
            "tailPos": tail,
            "parent": bone_models[parent_id]["name"] if parent_id in bone_models else None,
            "length": float(item.get("length") or 1.0),
            "restMatrix": None,
        })

    return {
        "vertices": vertices,
        "indices": indices,
        "uvs": [],
        "normals": [],
        "bones": bones,
        "weights": cluster_weights or _weights_from_nearest_bone(vertices, bones),
        "rig_source": "bind_pose" if bind_pose_matrices else "cluster_transform_link" if cluster_matrices else "model_trs",
    }


def _weights_from_nearest_bone(vertices: List[float], bones: List[Dict[str, Any]]) -> Dict[str, Dict[str, List[float]]]:
    weights = {bone["name"]: {"indices": [], "weights": []} for bone in bones if bone.get("name")}
    if not vertices or not bones:
        return weights
    heads = [(bone["name"], bone.get("headPos") or [0.0, 0.0, 0.0]) for bone in bones if bone.get("name")]
    for vi in range(len(vertices) // 3):
        vx, vy, vz = vertices[vi * 3], vertices[vi * 3 + 1], vertices[vi * 3 + 2]
        nearest_name = heads[0][0]
        min_dist = float("inf")
        for name, head in heads:
            dx = vx - float(head[0])
            dy = vy - float(head[1])
            dz = vz - float(head[2])
            dist = dx * dx + dy * dy + dz * dz
            if dist < min_dist:
                min_dist = dist
                nearest_name = name
        weights[nearest_name]["indices"].append(vi)
        weights[nearest_name]["weights"].append(1.0)
    return weights


def _point_bounds(points: List[List[float]]) -> Dict[str, Any] | None:
    clean = []
    for point in points:
        if isinstance(point, list) and len(point) >= 3:
            clean.append([float(point[0]), float(point[1]), float(point[2])])
    if not clean:
        return None
    mins = [min(p[i] for p in clean) for i in range(3)]
    maxs = [max(p[i] for p in clean) for i in range(3)]
    size = [maxs[i] - mins[i] for i in range(3)]
    center = [(mins[i] + maxs[i]) / 2.0 for i in range(3)]
    return {"min": mins, "max": maxs, "size": size, "center": center}


def _vertex_bounds(vertices: List[float]) -> Dict[str, Any] | None:
    if len(vertices) < 3:
        return None
    points = [[vertices[i], vertices[i + 1], vertices[i + 2]] for i in range(0, len(vertices) - 2, 3)]
    return _point_bounds(points)


def _normalization_source_bounds(vertices: List[float], bones: List[Dict[str, Any]]) -> Dict[str, Any] | None:
    points = []
    for i in range(0, len(vertices) - 2, 3):
        points.append([float(vertices[i]), float(vertices[i + 1]), float(vertices[i + 2])])
    for bone in bones:
        point = bone.get("headPos")
        if isinstance(point, list) and len(point) >= 3:
            points.append([float(point[0]), float(point[1]), float(point[2])])
    bounds = _point_bounds(points)
    if bounds and max(bounds["size"]) > 1e-6:
        return bounds
    return None


def _transform_point(point: List[float], center: List[float], scale: float) -> List[float]:
    return [
        (float(point[0]) - center[0]) * scale,
        (float(point[1]) - center[1]) * scale,
        (float(point[2]) - center[2]) * scale,
    ]


def _mat_identity() -> List[List[float]]:
    return [
        [1.0, 0.0, 0.0, 0.0],
        [0.0, 1.0, 0.0, 0.0],
        [0.0, 0.0, 1.0, 0.0],
        [0.0, 0.0, 0.0, 1.0],
    ]


def _mat_mul(a: List[List[float]], b: List[List[float]]) -> List[List[float]]:
    return [[sum(a[r][k] * b[k][c] for k in range(4)) for c in range(4)] for r in range(4)]


def _mat_translate(tx: float, ty: float, tz: float) -> List[List[float]]:
    m = _mat_identity()
    m[0][3], m[1][3], m[2][3] = tx, ty, tz
    return m


def _mat_scale(sx: float, sy: float, sz: float) -> List[List[float]]:
    m = _mat_identity()
    m[0][0], m[1][1], m[2][2] = sx, sy, sz
    return m


def _mat_rotate_xyz(rx: float, ry: float, rz: float) -> List[List[float]]:
    import math

    x, y, z = math.radians(rx), math.radians(ry), math.radians(rz)
    cx, sx = math.cos(x), math.sin(x)
    cy, sy = math.cos(y), math.sin(y)
    cz, sz = math.cos(z), math.sin(z)
    mx = [
        [1.0, 0.0, 0.0, 0.0],
        [0.0, cx, -sx, 0.0],
        [0.0, sx, cx, 0.0],
        [0.0, 0.0, 0.0, 1.0],
    ]
    my = [
        [cy, 0.0, sy, 0.0],
        [0.0, 1.0, 0.0, 0.0],
        [-sy, 0.0, cy, 0.0],
        [0.0, 0.0, 0.0, 1.0],
    ]
    mz = [
        [cz, -sz, 0.0, 0.0],
        [sz, cz, 0.0, 0.0],
        [0.0, 0.0, 1.0, 0.0],
        [0.0, 0.0, 0.0, 1.0],
    ]
    return _mat_mul(_mat_mul(mz, my), mx)


def _model_local_matrix(model: Dict[str, Any]) -> List[List[float]]:
    t = model.get("translation") or [0.0, 0.0, 0.0]
    r = model.get("rotation") or [0.0, 0.0, 0.0]
    s = model.get("scaling") or [1.0, 1.0, 1.0]
    return _mat_mul(
        _mat_translate(float(t[0]), float(t[1]), float(t[2])),
        _mat_mul(
            _mat_rotate_xyz(float(r[0]), float(r[1]), float(r[2])),
            _mat_scale(float(s[0]), float(s[1]), float(s[2])),
        ),
    )


def _apply_matrix(point: List[float], matrix: List[List[float]]) -> List[float]:
    x, y, z = float(point[0]), float(point[1]), float(point[2])
    return [
        matrix[0][0] * x + matrix[0][1] * y + matrix[0][2] * z + matrix[0][3],
        matrix[1][0] * x + matrix[1][1] * y + matrix[1][2] * z + matrix[1][3],
        matrix[2][0] * x + matrix[2][1] * y + matrix[2][2] * z + matrix[2][3],
    ]


def _global_model_matrix(model_id: int, models: Dict[int, Dict[str, Any]], parent_by_child: Dict[int, int], visiting=None) -> List[List[float]]:
    visiting = visiting or set()
    local = _model_local_matrix(models.get(model_id) or {})
    parent_id = parent_by_child.get(model_id)
    if parent_id in models and parent_id not in visiting:
        visiting.add(model_id)
        return _mat_mul(_global_model_matrix(parent_id, models, parent_by_child, visiting), local)
    return local


def _apply_matrix_to_vertices(vertices: List[float], matrix: List[List[float]]) -> List[float]:
    transformed = []
    for i in range(0, len(vertices) - 2, 3):
        transformed.extend(_apply_matrix([vertices[i], vertices[i + 1], vertices[i + 2]], matrix))
    return transformed


def _matrix_from_fbx_values(values: Any) -> List[List[float]] | None:
    if not isinstance(values, list) or len(values) < 16:
        return None
    nums = [float(v) for v in values[:16]]
    return [
        [nums[0], nums[4], nums[8], nums[12]],
        [nums[1], nums[5], nums[9], nums[13]],
        [nums[2], nums[6], nums[10], nums[14]],
        [nums[3], nums[7], nums[11], nums[15]],
    ]


def _matrix_translation(matrix: List[List[float]]) -> List[float]:
    return [float(matrix[0][3]), float(matrix[1][3]), float(matrix[2][3])]


def _normalize_uploaded_model(model: Dict[str, Any]) -> Dict[str, Any]:
    model = _annotate_sam3d_bone_semantics(model)
    vertices = [float(v) for v in (model.get("vertices") or [])]
    bones = model.get("bones") or []
    source_bounds = _normalization_source_bounds(vertices, bones)
    if not source_bounds:
        return model

    source_height = max(float(source_bounds["size"][1] or 0.0), 1e-6)
    scale = VNCCS_TARGET_MODEL_HEIGHT / source_height
    center = source_bounds["center"]

    normalized_vertices: List[float] = []
    for i in range(0, len(vertices) - 2, 3):
        normalized_vertices.extend(_transform_point([vertices[i], vertices[i + 1], vertices[i + 2]], center, scale))

    normalized_bones = []
    for bone in bones:
        item = dict(bone)
        head = item.get("headPos") or [0.0, 0.0, 0.0]
        tail = item.get("tailPos") or head
        item["headPos"] = _transform_point(head, center, scale)
        item["tailPos"] = _transform_point(tail, center, scale)
        item["length"] = float(item.get("length") or 1.0) * scale
        normalized_bones.append(item)

    model = dict(model)
    model["vertices"] = normalized_vertices
    model["bones"] = normalized_bones
    if not model.get("weights"):
        model["weights"] = _weights_from_nearest_bone(normalized_vertices, normalized_bones)
    model["import_transform"] = {
        "normalized": True,
        "target_height": VNCCS_TARGET_MODEL_HEIGHT,
        "scale": scale,
        "center": center,
        "source_bounds": source_bounds,
        "normalized_bounds": _vertex_bounds(normalized_vertices),
    }
    return model


def _parse_ascii_fbx_model(content: bytes) -> Dict[str, Any]:
    if content.startswith(FBX_BINARY_HEADER):
        return _parse_binary_fbx_model(content)
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        text = content.decode("latin-1")
    if "FBX" not in text[:512] and "Objects:" not in text:
        raise HTTPException(status_code=400, detail="无法识别 FBX 文件")

    vertices: List[float] = []
    indices: List[int] = []
    geometry_id = None
    for header, block in _extract_fbx_blocks(text, "Geometry"):
        if '"Mesh"' not in header:
            continue
        geom_match = re.search(r"Geometry\s*:\s*(\d+)", header)
        geometry_id = int(geom_match.group(1)) if geom_match else None
        vertices = _parse_fbx_array(block, "Vertices")
        poly_values = _parse_fbx_array(block, "PolygonVertexIndex")
        indices = _parse_fbx_polygon_indices(poly_values)
        if vertices and indices:
            break

    if not vertices or not indices:
        raise HTTPException(status_code=400, detail="FBX 中未找到可用 Mesh 顶点和面数据")
    if len(vertices) // 3 > 250000:
        raise HTTPException(status_code=400, detail="FBX 顶点数过大，当前最多支持 250000 个顶点")

    models: Dict[int, Dict[str, Any]] = {}
    for header, block in _extract_fbx_blocks(text, "Model"):
        match = re.search(r'Model\s*:\s*(\d+)\s*,\s*"(?:(?:Model::)?([^"]+))"\s*,\s*"([^"]+)"', header)
        if not match:
            continue
        model_id = int(match.group(1))
        name = _fbx_name(match.group(2) or f"bone_{model_id}")
        model_type = match.group(3)
        models[model_id] = {
            "id": model_id,
            "name": name,
            "type": model_type,
            "translation": _parse_fbx_lcl_translation(block),
            "rotation": _parse_fbx_lcl_rotation(block),
            "scaling": _parse_fbx_lcl_scaling(block),
            "length": _parse_fbx_size(block),
        }

    parent_by_child: Dict[int, int] = {}
    for child, parent in re.findall(r'C\s*:\s*"OO"\s*,\s*(\d+)\s*,\s*(\d+)', text):
        parent_by_child[int(child)] = int(parent)

    mesh_model_id = parent_by_child.get(geometry_id) if geometry_id is not None else None
    if mesh_model_id in models:
        vertices = _apply_matrix_to_vertices(vertices, _global_model_matrix(mesh_model_id, models, parent_by_child))

    bone_types = {"LimbNode", "Skeleton", "Null"}
    bone_models = {
        mid: item for mid, item in models.items()
        if item.get("type") in bone_types
        and item.get("name") not in {"GeneratedRigMesh", "RootNode", "SceneRoot"}
        and mid != mesh_model_id
    }
    if not bone_models:
        raise HTTPException(status_code=400, detail="FBX 中未找到骨骼节点，无法作为姿态编辑人偶加载")

    bone_parent_by_child = {
        child_id: parent_id
        for child_id, parent_id in parent_by_child.items()
        if child_id in bone_models and parent_id in bone_models
    }

    def absolute_head(model_id: int, visiting=None) -> List[float]:
        return _apply_matrix([0.0, 0.0, 0.0], _global_model_matrix(model_id, models, parent_by_child, visiting))

    children: Dict[int, List[int]] = {}
    for child_id, parent_id in bone_parent_by_child.items():
        children.setdefault(parent_id, []).append(child_id)

    bones: List[Dict[str, Any]] = []
    for model_id, item in bone_models.items():
        head = absolute_head(model_id)
        child_heads = [absolute_head(child_id) for child_id in children.get(model_id, [])]
        tail = child_heads[0] if child_heads else [head[0], head[1] + float(item.get("length") or 1.0), head[2]]
        parent_id = bone_parent_by_child.get(model_id)
        bones.append({
            "name": item["name"],
            "headPos": head,
            "tailPos": tail,
            "parent": bone_models[parent_id]["name"] if parent_id in bone_models else None,
            "length": float(item.get("length") or 1.0),
            "restMatrix": None,
        })

    return {
        "vertices": vertices,
        "indices": indices,
        "uvs": [],
        "normals": [],
        "bones": bones,
        "weights": _weights_from_nearest_bone(vertices, bones),
    }


def register_uploaded_fbx_model(content: bytes, filename_hint: str = "uploaded-model") -> Dict[str, Any]:
    if not content:
        raise HTTPException(status_code=400, detail="FBX 文件为空")
    model = _normalize_uploaded_model(_parse_ascii_fbx_model(content))
    model_id = hashlib.sha1(content + uuid.uuid4().bytes).hexdigest()[:16]
    model_data = {
        "status": "success",
        "source": "pose-studio-uploaded-fbx",
        "model_id": model_id,
        **model,
    }
    stem = sanitize_export_filename(os.path.splitext(filename_hint or "uploaded-model")[0], "uploaded-model")
    fbx_name = f"{stem}_{model_id}.fbx"

    return {
        "success": True,
        "model_id": model_id,
        "model_data": model_data,
        "fbx_url": "",
        "url": "",
        "file_id": "",
        "filename": fbx_name,
        "vertices": len(model_data.get("vertices") or []) // 3,
        "triangles": len(model_data.get("indices") or []) // 3,
        "bones": len(model_data.get("bones") or []),
    }
