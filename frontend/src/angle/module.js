import * as THREE from 'three';

        // Initialize WebSocket Listener for Cloud Progress
        window.addEventListener('message', function(event) {
            const data = event.data;
            if (data && data.type === 'cloud_status') {
                updateCloudProgress(data);
            }
        });

        export function updateCloudProgress(data) {
            const container = document.getElementById('cloud-progress-container');
            const statusText = document.getElementById('cloud-status-text');
            const progressBar = document.getElementById('cloud-progress-bar');
            const percentText = document.getElementById('cloud-percent');

            if (!container || !statusText || !progressBar) return;

            // Show container if hidden
            if (container.classList.contains('hidden')) {
                container.classList.remove('hidden');
            }

            // Update UI
            if (data.status) {
                // Simplify status text (remove internal details if needed)
                let displayStatus = data.status;
                if (displayStatus.includes("PENDING")) displayStatus = "Queueing...";
                if (displayStatus.includes("RUNNING")) displayStatus = "Generating...";
                statusText.innerText = displayStatus;
            }

            if (typeof data.progress !== 'undefined' && typeof data.total !== 'undefined') {
                const percent = Math.min(100, Math.round((data.progress / data.total) * 100));
                progressBar.style.width = `${percent}%`;
                percentText.innerText = `${percent}%`;
            }
        }

        export const angleControl = createAngleCamera();

        function createAngleCamera() {
        const container = document.getElementById('threeContainer');
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x222222);

        // Camera setup
        const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);

        // Renderer setup
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        container.appendChild(renderer.domElement);

        // Objects
        const geometry = new THREE.PlaneGeometry(3, 3);
        const material = new THREE.MeshStandardMaterial({
            color: 0x444444,
            side: THREE.DoubleSide
        });
        const cube = new THREE.Mesh(geometry, material);
        scene.add(cube);

        const gridHelper = new THREE.GridHelper(20, 20, 0x444444, 0x333333);
        scene.add(gridHelper);

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);
        const pointLight = new THREE.DirectionalLight(0xffffff, 1);
        pointLight.position.set(5, 10, 7);
        scene.add(pointLight);

        // Camera Logic
        const sliderH = document.getElementById('rotate-h');
        const sliderV = document.getElementById('rotate-v');
        const sliderD = document.getElementById('distance');
        const valH = document.getElementById('val-horizontal');
        const valV = document.getElementById('val-vertical');
        const valD = document.getElementById('val-distance');

        function updateCamera() {
            const lon = parseFloat(sliderH.value);
            const lat = parseFloat(sliderV.value);
            const dist = parseFloat(sliderD.value);

            // Sync inputs (avoid overwriting if active)
            if (document.activeElement !== valH) valH.value = lon;
            if (document.activeElement !== valV) valV.value = lat;
            if (document.activeElement !== valD) valD.value = dist.toFixed(1);

            const phi = THREE.MathUtils.degToRad(90 - lat);
            const theta = THREE.MathUtils.degToRad(lon);

            camera.position.x = dist * Math.sin(phi) * Math.sin(theta);
            camera.position.y = dist * Math.cos(phi);
            camera.position.z = dist * Math.sin(phi) * Math.cos(theta);
            camera.lookAt(0, 0, 0);

            // Real-time update prompt
            updatePromptWithAngle(lon, lat, dist);
        }

        function syncInput(type) {
            if (type === 'h') {
                let v = parseFloat(valH.value);
                if (!isNaN(v)) sliderH.value = v;
            } else if (type === 'v') {
                let v = parseFloat(valV.value);
                if (!isNaN(v)) sliderV.value = v;
            } else if (type === 'd') {
                let v = parseFloat(valD.value);
                if (!isNaN(v)) sliderD.value = v;
            }
            updateCamera();
        }

        function resetControl(type) {
            if (type === 'h') {
                sliderH.value = 0;
                valH.value = 0;
            } else if (type === 'v') {
                sliderV.value = 0;
                valV.value = 0;
            } else if (type === 'd') {
                sliderD.value = 4;
                valD.value = 4;
            }
            updateCamera();
        }

        // Build the RunningHub Qwen-Edit-2511 Multiple-Angles LoRA prompt:
        // "<sks> [azimuth] [elevation] [distance]"
        function buildAnglePrompt(h, v, d) {
            // Azimuth: slider -180..180 -> normalized to 0..359 and snapped to the nearest 45°
            const azMap = {
                0: "front view",
                45: "front-right quarter view",
                90: "right side view",
                135: "back-right quarter view",
                180: "back view",
                225: "back-left quarter view",
                270: "left side view",
                315: "front-left quarter view"
            };
            const normalized = ((Math.round(h) % 360) + 360) % 360;
            const azKey = (Math.round(normalized / 45) * 45) % 360;
            const azimuth = azMap[azKey] || "front view";

            // Elevation: low(-30) / eye-level(0) / elevated(30) / high(60)
            let elevation;
            if (v <= -15) elevation = "low-angle shot";
            else if (v < 15) elevation = "eye-level shot";
            else if (v < 45) elevation = "elevated shot";
            else elevation = "high-angle shot";

            // Distance: default slider value 4 -> medium; closer -> close-up; farther -> wide
            let distance;
            if (d < 3.5) distance = "close-up";
            else if (d <= 5) distance = "medium shot";
            else distance = "wide shot";

            return `<sks> ${azimuth} ${elevation} ${distance}`;
        }

        function updatePromptWithAngle(h, v, d) {
            document.getElementById('promptInput').value = buildAnglePrompt(h, v, d);
        }

        sliderH.addEventListener('input', updateCamera);
        sliderV.addEventListener('input', updateCamera);
        sliderD.addEventListener('input', updateCamera);
        updateCamera();

        // Animation Loop
        function animate() {
            requestAnimationFrame(animate);
            renderer.render(scene, camera);
        }
        animate();

        // Handle Resize
        const resizeObserver = new ResizeObserver(() => {
            const w = container.clientWidth;
            const h = container.clientHeight;
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
        });
        resizeObserver.observe(container);

        // Expose function to update texture
        function update3DTexture(url) {
            new THREE.TextureLoader().load(url, (texture) => {
                texture.colorSpace = THREE.SRGBColorSpace;

                // Adjust plane aspect ratio to match image
                const imageAspect = texture.image.width / texture.image.height;
                cube.scale.set(1, 1 / imageAspect, 1);
                if (imageAspect > 1) {
                    cube.scale.set(1, 1 / imageAspect, 1);
                    // Reset base scale to 3
                    cube.geometry.dispose();
                    cube.geometry = new THREE.PlaneGeometry(3, 3 / imageAspect);
                    cube.scale.set(1, 1, 1);
                } else {
                    cube.geometry.dispose();
                    cube.geometry = new THREE.PlaneGeometry(3 * imageAspect, 3);
                    cube.scale.set(1, 1, 1);
                }

                cube.material = new THREE.MeshBasicMaterial({
                    map: texture,
                    side: THREE.DoubleSide
                });
                cube.material.needsUpdate = true;

                // Show control panel (already visible, but keep logic safe)
                document.getElementById('cameraControl').classList.remove('hidden');

                // Force resize check after texture load
                setTimeout(() => {
                    const w = container.clientWidth;
                    const h = container.clientHeight;
                    camera.aspect = w / h;
                    camera.updateProjectionMatrix();
                    renderer.setSize(w, h);
                }, 100);
            });
        }
        return { reset: resetControl, syncInput, update3DTexture };
        }
