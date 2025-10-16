// =============================
// Vertex Shader for Simulation
// =============================
// The vertex shader runs once per vertex (corner) of the geometry.
// Here it's super simple: just pass texture coordinates (uv) forward.

export const simulationVertexShader = `
varying vec2 vUv;  // Pass UV coordinates to the fragment shader

void main() {
    vUv = uv;  // Store the current vertex's UV coordinate
    // Position the vertex normally using built-in matrices
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// ===================================
// Fragment Shader for Ripple Simulation
// ===================================
// This shader simulates water ripples by storing wave "pressure" values
// into a texture. It updates every frame to create the ripple effect.

export const simulationFragmentShader = `
uniform sampler2D textureA;  // Previous frame's simulation texture
uniform vec2 mouse;          // Current mouse position (in pixels)
uniform vec2 resolution;     // Resolution of the simulation (width/height)
uniform float time;          // Elapsed time
uniform int frame;           // Current frame number
varying vec2 vUv;            // UV coordinates from vertex shader

const float delta = 1.4;     // A tuning constant for ripple strength

// --- Idle ripples (raindrop effect) ---
float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
    vec2 uv = vUv;  // Current pixel coordinates (normalized 0-1)
    
    // On the very first frame, clear everything
    if (frame == 0) {
        gl_FragColor = vec4(0.0); // No ripples
        return;
    }

    // Get simulation data from the previous frame
    vec4 data = texture2D(textureA, uv);
    float pressure = data.x; // Water height at this pixel
    float pVel = data.y;     // Velocity of the wave

    // Lookup the 4 neighbors (right, left, up, down)
    vec2 textSize = 1.0 / resolution;
    float p_right = texture2D(textureA, uv + vec2(textSize.x, 0.0)).x;
    float p_left  = texture2D(textureA, uv + vec2(-textSize.x, 0.0)).x;
    float p_up    = texture2D(textureA, uv + vec2(0.0, textSize.y)).x;
    float p_down  = texture2D(textureA, uv + vec2(0.0, -textSize.y)).x;

    // Handle edges (avoid sampling outside bounds by mirroring)
    if (uv.x <= textSize.x) p_left = p_right;
    if (uv.x >= 1.0 - textSize.x) p_right = p_left;
    if (uv.y <= textSize.y) p_down = p_up;
    if (uv.y >= 1.0 - textSize.y) p_up = p_down;

    // --- Wave simulation math ---
    // Update velocity by checking differences with neighbors
    pVel += delta * (-2.0 * pressure + p_right + p_left) / 4.0;
    pVel += delta * (-2.0 * pressure + p_up + p_down) / 4.0;

    // Update pressure by adding velocity
    pressure += delta * pVel;

    // Add a bit of damping (like friction) so waves don’t grow forever
    pVel -= 0.005 * delta * pressure;
    pVel *= 1.0 - 0.002 * delta;
    pressure *= 0.999;

    // --- Mouse interaction ---
    // Convert mouse from pixels to UV space (0–1)
    vec2 mouseUV = mouse / resolution;
    if(mouse.x > 0.0) { // If mouse is inside the canvas
        float dist = distance(uv, mouseUV); // Distance from current pixel to mouse
        if(dist <= 0.02) { // Small circle around cursor
            // Add a ripple "kick" at the mouse position
            pressure += 1.0 * (1.0 - dist / 0.02);
        }
    }

    // --- Idle raindrops ---
    for (int i = 0; i < 5; i++) {  // more drops per frame
        float t = floor(time * 1.5) + float(i);  // faster (every ~0.6s)
        vec2 dropPos = vec2(hash(vec2(t, 1.0)), hash(vec2(t, 2.0))); 
        float dist = distance(uv, dropPos);
        // Bigger, stronger ripples
        pressure += exp(-dist * 80.0) * 0.50;
    }

    // Output new pressure, velocity, and gradients (for lighting)
    gl_FragColor = vec4(
        pressure,   // x: wave height
        pVel,       // y: wave velocity
        (p_right - p_left) / 2.0, // z: horizontal slope
        (p_up - p_down) / 2.0     // w: vertical slope
    );
}
`;

// =============================
// Vertex Shader for Rendering
// =============================
// Same as before: pass UVs and position normally.

export const renderVertexShader = `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// ===================================
// Fragment Shader for Rendering Ripples
// ===================================
// This shader takes the simulation texture and applies it to an image
// to distort it like water. It also adds highlights for sunlight reflection.

export const renderFragmentShader = `
uniform sampler2D textureA; // The ripple simulation results
uniform sampler2D textureB; // The background texture (e.g., image/text)
varying vec2 vUv;

void main() {
    // Get ripple data at this pixel
    vec4 data = texture2D(textureA, vUv);

    // Distort the background based on ripple normals
    vec2 distortion = 0.3 * data.zw; // z,w are gradients from simulation
    vec4 color = texture2D(textureB, vUv + distortion);

    // --- Fake sunlight reflection ---
    // Create a "normal" vector from ripple slopes
    vec3 normal = normalize(vec3(-data.z * 2.0, 0.5, -data.w * 2.0));
    vec3 lightDir = normalize(vec3(-3.0, 10.0, 3.0)); // Sunlight direction
    float specular = pow(max(0.0, dot(normal, lightDir)), 60.0) * 1.5;

    // Final pixel = distorted background + sunlight highlight
    gl_FragColor = color + vec4(specular);
}
`;