import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { uploadFbx } from '../services/files.js';
import './page.css';

        const viewport = document.getElementById('viewport');
        const fileInput = document.getElementById('fileInput');
        const metaEl = document.getElementById('meta');
        const listEl = document.getElementById('list');
        const outputEl = document.getElementById('output');
        const countEl = document.getElementById('count');
        const searchEl = document.getElementById('search');
        const toastEl = document.getElementById('toast');

        const state = {
            model: null,
            bones: [],
            markers: [],
            selected: new Set(),
            activeIndex: -1,
        };

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xf1f5f9);
        const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 10000);
        camera.position.set(0, 8, 28);
        const renderer = new THREE.WebGLRenderer({ antialias:true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        viewport.appendChild(renderer.domElement);

        const orbit = new OrbitControls(camera, renderer.domElement);
        orbit.enableDamping = true;
        orbit.dampingFactor = 0.08;
        scene.add(new THREE.HemisphereLight(0xffffff, 0x9ca3af, 2.2));
        const dir = new THREE.DirectionalLight(0xffffff, 1.4);
        dir.position.set(5, 8, 10);
        scene.add(dir);
        scene.add(new THREE.GridHelper(24, 24, 0xcbd5e1, 0xe2e8f0));

        const modelGroup = new THREE.Group();
        scene.add(modelGroup);
        const markerGroup = new THREE.Group();
        scene.add(markerGroup);

        const markerGeo = new THREE.SphereGeometry(0.075, 16, 12);
        const markerMat = new THREE.MeshBasicMaterial({ color:0xf59e0b, depthTest:false, depthWrite:false });
        const selectedMat = new THREE.MeshBasicMaterial({ color:0x14b8a6, depthTest:false, depthWrite:false });
        const activeMat = new THREE.MeshBasicMaterial({ color:0x2563eb, depthTest:false, depthWrite:false });
        const lineMat = new THREE.LineBasicMaterial({ color:0x475569, transparent:true, opacity:0.55 });
        const raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2();

        function toast(text) {
            toastEl.textContent = text;
            toastEl.style.opacity = '1';
            clearTimeout(toastEl._timer);
            toastEl._timer = setTimeout(() => toastEl.style.opacity = '0', 1400);
        }

        function resize() {
            const w = viewport.clientWidth || 800;
            const h = viewport.clientHeight || 600;
            renderer.setSize(w, h, false);
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
        }
        new ResizeObserver(resize).observe(viewport);
        resize();

        function clearGroup(group) {
            while (group.children.length) {
                const child = group.children[group.children.length - 1];
                group.remove(child);
                child.traverse?.((obj) => {
                    if (obj.geometry && obj.geometry !== markerGeo) obj.geometry.dispose?.();
                    if (obj.material && obj.material !== markerMat && obj.material !== selectedMat && obj.material !== activeMat && obj.material !== lineMat) {
                        obj.material.dispose?.();
                    }
                });
            }
        }

        function boneLabel(bone) {
            return bone.semanticName ? `${bone.name} -> ${bone.semanticName}` : bone.name;
        }

        function pointFrom(value) {
            return new THREE.Vector3(Number(value?.[0]) || 0, Number(value?.[1]) || 0, Number(value?.[2]) || 0);
        }

        function fitCamera(points) {
            const box = new THREE.Box3().setFromPoints(points);
            if (box.isEmpty()) return;
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const radius = Math.max(size.length() * 0.5, 1);
            orbit.target.copy(center);
            camera.position.copy(center).add(new THREE.Vector3(0, radius * 0.25, radius * 2.4));
            camera.near = Math.max(radius / 500, 0.01);
            camera.far = radius * 20 + 100;
            camera.updateProjectionMatrix();
            orbit.update();
        }

        function buildMesh(model) {
            if (!model.vertices?.length || !model.indices?.length) return;
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(model.vertices, 3));
            geometry.setIndex(model.indices);
            geometry.computeVertexNormals();
            const material = new THREE.MeshStandardMaterial({
                color:0xffffff,
                roughness:0.72,
                metalness:0.02,
                transparent:true,
                opacity:0.38,
                side:THREE.DoubleSide,
            });
            modelGroup.add(new THREE.Mesh(geometry, material));
        }

        function buildBones(model) {
            state.bones = (model.bones || []).map((bone, index) => ({ ...bone, index }));
            const byName = new Map(state.bones.map(bone => [bone.name, bone]));
            const linePositions = [];
            for (const bone of state.bones) {
                const head = pointFrom(bone.headPos);
                const parent = byName.get(bone.parent);
                if (parent) {
                    const parentHead = pointFrom(parent.headPos);
                    linePositions.push(parentHead.x, parentHead.y, parentHead.z, head.x, head.y, head.z);
                } else if (bone.tailPos) {
                    const tail = pointFrom(bone.tailPos);
                    linePositions.push(head.x, head.y, head.z, tail.x, tail.y, tail.z);
                }
                const marker = new THREE.Mesh(markerGeo, markerMat);
                marker.position.copy(head);
                marker.userData.index = bone.index;
                marker.renderOrder = 10;
                markerGroup.add(marker);
                state.markers.push(marker);
            }
            if (linePositions.length) {
                const lineGeo = new THREE.BufferGeometry();
                lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
                modelGroup.add(new THREE.LineSegments(lineGeo, lineMat));
            }
        }

        function updateMarkerMaterials() {
            for (const marker of state.markers) {
                const index = marker.userData.index;
                marker.material = index === state.activeIndex ? activeMat : state.selected.has(index) ? selectedMat : markerMat;
                marker.scale.setScalar(index === state.activeIndex ? 1.75 : state.selected.has(index) ? 1.35 : 1);
            }
        }

        function selectedPayload() {
            return [...state.selected]
                .sort((a, b) => a - b)
                .map(index => {
                    const bone = state.bones[index];
                    return {
                        index,
                        name: bone.name,
                        semanticName: bone.semanticName || null,
                        parent: bone.parent || null,
                    };
                });
        }

        function refreshOutput() {
            const payload = selectedPayload();
            outputEl.value = JSON.stringify(payload, null, 2);
            countEl.textContent = `${payload.length} / ${state.bones.length} selected`;
            updateMarkerMaterials();
        }

        function renderList() {
            const query = searchEl.value.trim().toLowerCase();
            listEl.innerHTML = '';
            for (const bone of state.bones) {
                const label = boneLabel(bone);
                const haystack = `${label} ${bone.parent || ''} ${bone.index}`.toLowerCase();
                if (query && !haystack.includes(query)) continue;
                const row = document.createElement('div');
                row.className = `item${state.selected.has(bone.index) ? ' selected' : ''}${state.activeIndex === bone.index ? ' active' : ''}`;
                row.innerHTML = `
                    <div class="dot"></div>
                    <div>
                        <div class="name">${label}</div>
                        <div class="sub">#${bone.index} parent: ${bone.parent || '-'}</div>
                    </div>
                `;
                row.addEventListener('click', () => toggleBone(bone.index, true));
                listEl.appendChild(row);
            }
        }

        function toggleBone(index, focus = false) {
            if (state.selected.has(index)) state.selected.delete(index);
            else state.selected.add(index);
            state.activeIndex = index;
            if (focus) {
                const marker = state.markers[index];
                if (marker) {
                    orbit.target.copy(marker.position);
                    orbit.update();
                }
            }
            renderList();
            refreshOutput();
        }

        function loadModel(model) {
            state.model = model;
            state.bones = [];
            state.markers = [];
            state.selected = new Set();
            state.activeIndex = -1;
            clearGroup(modelGroup);
            clearGroup(markerGroup);
            buildMesh(model);
            buildBones(model);
            const points = [];
            for (let i = 0; i < (model.vertices || []).length - 2; i += 3) {
                points.push(new THREE.Vector3(model.vertices[i], model.vertices[i + 1], model.vertices[i + 2]));
            }
            for (const bone of state.bones) points.push(pointFrom(bone.headPos));
            fitCamera(points);
            selectMapped();
            metaEl.textContent = `${model.filename || model.model_id || 'model'} | ${Math.floor((model.vertices || []).length / 3)} verts | ${state.bones.length} bones`;
            renderList();
            refreshOutput();
        }

        async function uploadFile(file) {
            if (!file) return;
            metaEl.textContent = '正在上传并解析 FBX...';
            const data = await uploadFbx(file);
            const model = data.model_data;
            if (!model || typeof model !== 'object') throw new Error('模型数据加载失败');
            model.filename = data.filename;
            loadModel(model);
            toast('FBX 已加载');
        }

        function selectMapped() {
            state.selected.clear();
            for (const bone of state.bones) {
                if (bone.showMarker === true || (!state.bones.some(item => item.showMarker === true) && bone.semanticName)) {
                    state.selected.add(bone.index);
                }
            }
            renderList();
            refreshOutput();
        }

        fileInput.addEventListener('change', () => {
            uploadFile(fileInput.files?.[0]).catch(err => {
                console.error(err);
                metaEl.textContent = `加载失败：${err.message || err}`;
            });
        });

        viewport.addEventListener('dragover', event => {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
        });
        viewport.addEventListener('drop', event => {
            event.preventDefault();
            uploadFile(event.dataTransfer.files?.[0]).catch(err => {
                console.error(err);
                metaEl.textContent = `加载失败：${err.message || err}`;
            });
        });

        renderer.domElement.addEventListener('pointerdown', event => {
            const rect = renderer.domElement.getBoundingClientRect();
            pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            raycaster.setFromCamera(pointer, camera);
            const hits = raycaster.intersectObjects(state.markers, false);
            if (hits.length) {
                event.preventDefault();
                toggleBone(hits[0].object.userData.index);
            }
        });

        document.getElementById('selectMappedBtn').addEventListener('click', selectMapped);
        document.getElementById('clearBtn').addEventListener('click', () => {
            state.selected.clear();
            renderList();
            refreshOutput();
        });
        document.getElementById('copyJsonBtn').addEventListener('click', async () => {
            await navigator.clipboard.writeText(outputEl.value || '[]');
            toast('JSON 已复制');
        });
        document.getElementById('copyNamesBtn').addEventListener('click', async () => {
            const names = selectedPayload().map(item => item.name).join('\n');
            await navigator.clipboard.writeText(names);
            toast('名称已复制');
        });
        searchEl.addEventListener('input', renderList);

        function animate() {
            orbit.update();
            renderer.render(scene, camera);
            requestAnimationFrame(animate);
        }
        animate();
        refreshOutput();
