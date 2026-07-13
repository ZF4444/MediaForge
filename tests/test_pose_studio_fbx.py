import os
import struct
import zlib

from app.core.media import output_file_from_url
from app.services.pose_studio import (
    FBX_BINARY_HEADER,
    VNCCS_GAME_ENGINE_BONE_NAMES,
    SAM3D_VISIBLE_MARKER_JOINTS,
    VNCCS_TARGET_MODEL_HEIGHT,
    _annotate_sam3d_bone_semantics,
    register_uploaded_fbx_model,
)


def _fbx_prop(value):
    if isinstance(value, str):
        raw = value.encode("utf-8")
        return b"S" + struct.pack("<I", len(raw)) + raw
    if isinstance(value, bytes):
        return b"S" + struct.pack("<I", len(value)) + value
    if isinstance(value, bool):
        return b"C" + struct.pack("<?", value)
    if isinstance(value, int):
        return b"L" + struct.pack("<q", value)
    if isinstance(value, float):
        return b"D" + struct.pack("<d", value)
    raise TypeError(value)


def _fbx_array_prop(code, values, compress=False):
    if code == "d":
        raw = struct.pack("<" + "d" * len(values), *[float(v) for v in values])
    elif code == "i":
        raw = struct.pack("<" + "i" * len(values), *[int(v) for v in values])
    else:
        raise TypeError(code)
    encoding = 1 if compress else 0
    if compress:
        raw = zlib.compress(raw)
    return code.encode("ascii") + struct.pack("<III", len(values), encoding, len(raw)) + raw


def _fbx_node(name, props=None, children=None):
    return {"name": name, "props": props or [], "children": children or []}


def _compile_binary_fbx(nodes):
    def compile_node(node, offset):
        name = node["name"].encode("utf-8")
        prop_blobs = node.get("props") or []
        prop_blob = b"".join(prop_blobs)
        header_len = 13 + len(name) + len(prop_blob)
        child_offset = offset + header_len
        child_blob = b""
        for child in node.get("children") or []:
            blob, child_offset = compile_node(child, child_offset)
            child_blob += blob
        null_record = b"\0" * 13
        end_offset = child_offset + len(null_record)
        header = struct.pack("<IIIB", end_offset, len(prop_blobs), len(prop_blob), len(name))
        return header + name + prop_blob + child_blob + null_record, end_offset

    offset = len(FBX_BINARY_HEADER) + 4
    body = b""
    for node in nodes:
        blob, offset = compile_node(node, offset)
        body += blob
    body += b"\0" * 13
    return FBX_BINARY_HEADER + struct.pack("<I", 7400) + body


def _fbx_matrix_prop(tx=0.0, ty=0.0, tz=0.0):
    values = [
        1.0, 0.0, 0.0, 0.0,
        0.0, 1.0, 0.0, 0.0,
        0.0, 0.0, 1.0, 0.0,
        float(tx), float(ty), float(tz), 1.0,
    ]
    return _fbx_array_prop("d", values)


def _binary_fbx_fixture(root_transform=None, bind_pose_child_y=None, bone_names=None) -> bytes:
    root_transform = root_transform or {}
    bone_names = bone_names or ("Root", "Chest")
    vertices = [0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0]
    poly_indices = [0, 1, -3]
    geometry = _fbx_node("Geometry", [
        _fbx_prop(1001),
        _fbx_prop("Geometry::Triangle"),
        _fbx_prop("Mesh"),
    ], [
        _fbx_node("Vertices", [_fbx_array_prop("d", vertices, compress=True)]),
        _fbx_node("PolygonVertexIndex", [_fbx_array_prop("i", poly_indices, compress=True)]),
    ])

    def model(model_id, name, model_type, tx, ty, tz, size=1.0, scaling=(1.0, 1.0, 1.0)):
        sx, sy, sz = scaling
        return _fbx_node("Model", [
            _fbx_prop(model_id),
            _fbx_prop(f"Model::{name}"),
            _fbx_prop(model_type),
        ], [
            _fbx_node("Properties70", children=[
                _fbx_node("P", [
                    _fbx_prop("Lcl Translation"),
                    _fbx_prop("Lcl Translation"),
                    _fbx_prop(""),
                    _fbx_prop("A"),
                    _fbx_prop(float(tx)),
                    _fbx_prop(float(ty)),
                    _fbx_prop(float(tz)),
                ]),
                _fbx_node("P", [
                    _fbx_prop("Size"),
                    _fbx_prop("double"),
                    _fbx_prop("Number"),
                    _fbx_prop("A"),
                    _fbx_prop(float(size)),
                ]),
                _fbx_node("P", [
                    _fbx_prop("Lcl Scaling"),
                    _fbx_prop("Lcl Scaling"),
                    _fbx_prop(""),
                    _fbx_prop("A"),
                    _fbx_prop(float(sx)),
                    _fbx_prop(float(sy)),
                    _fbx_prop(float(sz)),
                ]),
            ]),
        ])

    connections = _fbx_node("Connections", children=[
        _fbx_node("C", [_fbx_prop("OO"), _fbx_prop(1001), _fbx_prop(2001)]),
        _fbx_node("C", [_fbx_prop("OO"), _fbx_prop(2001), _fbx_prop(9001)]),
        _fbx_node("C", [_fbx_prop("OO"), _fbx_prop(3001), _fbx_prop(9001)]),
        _fbx_node("C", [_fbx_prop("OO"), _fbx_prop(3002), _fbx_prop(3001)]),
        _fbx_node("C", [_fbx_prop("OO"), _fbx_prop(9001), _fbx_prop(0)]),
    ])

    extra_nodes = []
    if bind_pose_child_y is not None:
        extra_nodes.append(_fbx_node("Pose", [
            _fbx_prop(4001),
            _fbx_prop("Pose::Bind"),
            _fbx_prop("BindPose"),
        ], [
            _fbx_node("PoseNode", children=[
                _fbx_node("Node", [_fbx_prop(3001)]),
                _fbx_node("Matrix", [_fbx_matrix_prop(0, 0, 0)]),
            ]),
            _fbx_node("PoseNode", children=[
                _fbx_node("Node", [_fbx_prop(3002)]),
                _fbx_node("Matrix", [_fbx_matrix_prop(0, bind_pose_child_y, 0)]),
            ]),
        ]))

    return _compile_binary_fbx([
        _fbx_node("Objects", children=[
            geometry,
            model(
                9001,
                "SceneRoot",
                "Null",
                root_transform.get("tx", 0.0),
                root_transform.get("ty", 0.0),
                root_transform.get("tz", 0.0),
                scaling=root_transform.get("scaling", (1.0, 1.0, 1.0)),
            ),
            model(2001, "Mesh", "Mesh", 0, 0, 0),
            model(3001, bone_names[0], "LimbNode", 0, 0, 0),
            model(3002, bone_names[1], "LimbNode", 0, 1, 0),
        ]),
        connections,
    ] + extra_nodes)


def test_pose_studio_upload_binary_fbx_registers_model():
    uploaded = {}
    paths = []
    try:
        uploaded = register_uploaded_fbx_model(_binary_fbx_fixture(), "binary.fbx")
        paths.append(output_file_from_url(uploaded["fbx_url"]))

        assert uploaded["success"] is True
        assert uploaded["filename"].endswith(".fbx")
        assert uploaded["vertices"] == 3
        assert uploaded["triangles"] == 1
        assert uploaded["bones"] == 2

        model = uploaded["model_data"]
        assert model["source"] == "pose-studio-uploaded-fbx"
        assert model["import_transform"]["normalized"] is True
        assert round(model["import_transform"]["normalized_bounds"]["size"][1], 2) == round(VNCCS_TARGET_MODEL_HEIGHT, 2)
        assert [bone["name"] for bone in model["bones"]] == ["Root", "Chest"]
        assert model["bones"][1]["parent"] == "Root"
        assert round(model["bones"][1]["headPos"][1] - model["bones"][0]["headPos"][1], 2) == round(VNCCS_TARGET_MODEL_HEIGHT, 2)
        assert model["weights"]
    finally:
        for path in paths:
            if path and os.path.exists(path):
                os.remove(path)


def test_pose_studio_upload_binary_fbx_applies_shared_parent_transform_before_normalizing():
    uploaded = {}
    paths = []
    try:
        uploaded = register_uploaded_fbx_model(
            _binary_fbx_fixture(root_transform={"tx": 4.0, "ty": 10.0, "tz": -2.0, "scaling": (2.0, 2.0, 2.0)}),
            "offset.fbx",
        )
        paths.append(output_file_from_url(uploaded["fbx_url"]))
        model = uploaded["model_data"]

        ys = model["vertices"][1::3]
        root = next(b for b in model["bones"] if b["name"] == "Root")["headPos"]
        chest = next(b for b in model["bones"] if b["name"] == "Chest")["headPos"]
        assert min(ys) <= root[1] <= max(ys)
        assert min(ys) <= chest[1] <= max(ys)
        assert round(max(ys) - min(ys), 2) == round(VNCCS_TARGET_MODEL_HEIGHT, 2)
    finally:
        for path in paths:
            if path and os.path.exists(path):
                os.remove(path)


def test_pose_studio_upload_binary_fbx_prefers_bind_pose_matrices_for_joints():
    uploaded = {}
    paths = []
    try:
        uploaded = register_uploaded_fbx_model(_binary_fbx_fixture(bind_pose_child_y=4.0), "bindpose.fbx")
        paths.append(output_file_from_url(uploaded["fbx_url"]))
        model = uploaded["model_data"]

        assert model["rig_source"] == "bind_pose"
        root = next(b for b in model["bones"] if b["name"] == "Root")
        chest = next(b for b in model["bones"] if b["name"] == "Chest")
        assert round(chest["headPos"][1] - root["headPos"][1], 2) == round(VNCCS_TARGET_MODEL_HEIGHT, 2)
    finally:
        for path in paths:
            if path and os.path.exists(path):
                os.remove(path)


def test_pose_studio_upload_binary_fbx_adds_sam3d_semantic_names():
    uploaded = {}
    paths = []
    try:
        uploaded = register_uploaded_fbx_model(
            _binary_fbx_fixture(bone_names=("Joint_001", "Joint_113")),
            "sam3d.fbx",
        )
        paths.append(output_file_from_url(uploaded["fbx_url"]))

        model = uploaded["model_data"]
        by_name = {bone["name"]: bone for bone in model["bones"]}
        assert by_name["Joint_001"]["semanticName"] == "Root"
        assert by_name["Joint_113"]["semanticName"] == "head"
        assert model["sam3d_semantic_map"] == "vnccs_mhr_forward_canonical"
    finally:
        for path in paths:
            if path and os.path.exists(path):
                os.remove(path)


def test_pose_studio_sam3d_semantic_names_cover_vnccs_game_engine_markers():
    model = {
        "bones": [
            {"name": f"Joint_{index:03d}", "headPos": [0, index, 0], "tailPos": [0, index + 1, 0]}
            for index in range(127)
        ]
    }

    annotated = _annotate_sam3d_bone_semantics(model)
    semantic_names = {
        bone["semanticName"]
        for bone in annotated["bones"]
        if bone.get("semanticName")
    }

    assert semantic_names == VNCCS_GAME_ENGINE_BONE_NAMES
    assert annotated["sam3d_semantic_count"] == 53
    assert annotated["sam3d_semantic_map"] == "vnccs_game_engine_display_53"


def test_pose_studio_sam3d_semantic_names_follow_provided_joint_map():
    model = {
        "bones": [
            {"name": f"Joint_{index:03d}", "headPos": [0, index, 0], "tailPos": [0, index + 1, 0]}
            for index in range(127)
        ]
    }

    annotated = _annotate_sam3d_bone_semantics(model)
    by_name = {bone["name"]: bone for bone in annotated["bones"]}

    expected = {
        "Joint_001": "Root",
        "Joint_008": "ball_l",
        "Joint_024": "ball_r",
        "Joint_034": "pelvis",
        "Joint_043": "pinky_01_r",
        "Joint_048": "ring_01_r",
        "Joint_056": "index_01_r",
        "Joint_060": "thumb_01_r",
        "Joint_079": "pinky_01_l",
        "Joint_084": "ring_01_l",
        "Joint_092": "index_01_l",
        "Joint_096": "thumb_01_l",
    }
    for joint_name, semantic_name in expected.items():
        assert by_name[joint_name]["semanticName"] == semantic_name

    assert "semanticName" not in by_name["Joint_000"]
    assert "semanticName" not in by_name["Joint_005"]
    assert "semanticName" not in by_name["Joint_126"]


def test_pose_studio_sam3d_visible_markers_follow_manual_selection():
    model = {
        "bones": [
            {"name": f"Joint_{index:03d}", "headPos": [0, index, 0], "tailPos": [0, index + 1, 0]}
            for index in range(127)
        ]
    }

    annotated = _annotate_sam3d_bone_semantics(model)
    visible = {
        int(bone["name"].split("_", 1)[1])
        for bone in annotated["bones"]
        if bone.get("showMarker")
    }

    assert visible == SAM3D_VISIBLE_MARKER_JOINTS
    assert 39 not in visible
    assert 75 not in visible
    assert 110 not in visible
    assert 46 in visible
    assert 63 in visible
    assert 111 in visible
    assert annotated["sam3d_marker_count"] == len(SAM3D_VISIBLE_MARKER_JOINTS)


def test_pose_studio_sam3d_output_filename_is_not_treated_as_input_media():
    from main import collect_required_comfy_media

    required = collect_required_comfy_media({
        "1": {"image": "uploaded.png"},
        "4": {"output_filename": "mediaforge_sam3d_unique.fbx"},
    })

    assert required == ["uploaded.png"]


def test_pose_studio_sam3d_workflow_info_uses_existing_workflow():
    from main import _sam3d_workflow_info

    workflow_json, image_node_id, export_node_id = _sam3d_workflow_info()

    assert workflow_json == "custom/Sam3DBody.json"
    assert image_node_id == "1"
    assert export_node_id == "4"
