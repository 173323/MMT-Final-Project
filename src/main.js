// Splash Screen
let intro = document.querySelector('.intro')
let logoSpan = document.querySelectorAll('.logo')

window.addEventListener('DOMContentLoaded', ()=>{  // Spawns in my two elements when the website has been loaded

  setTimeout(()=>{ 
    logoSpan.forEach((span, idx) => { 
      setTimeout(()=>{
        span.classList.add('active');
      }, (idx + 1) * 400) // First index would be nothing, so add 1 and multiply by 400ms
    });

    setTimeout(()=>{
      logoSpan.forEach((span, idx)=>{
        setTimeout(()=>{
          span.classList.remove('active');
          span.classList.add('fade');
        }, (idx + 1) * 50)
      })
    }, 2000);

    setTimeout(()=>{
      intro.style.top = '-100vh';
      document.body.classList.add('intro-complete'); // Reveals content
    }, 2300);
  })

})


// Arrow
// Wait for the SVG animation to finish (~6s as per CSS)
setTimeout(() => {
  const transitionCircle = document.querySelector('.transition-circle');
  
  if (transitionCircle) {
    transitionCircle.addEventListener('click', function() {
      // Trigger splash animation
      this.classList.add('splash-active');
      
      // Remove header after animation
      setTimeout(() => {
        const header = document.querySelector('header');
        if (header) {
          header.style.opacity = '0';
          header.style.pointerEvents = 'none';
          
          // Remove header after transition
          setTimeout(() => header.remove(), 500);
        }
        
        // Unlock scrolling
        document.body.classList.add('scroll-unlocked');
        
        // Remove the circle button
        this.remove();
      }, 1000); // Match with splash animation duration
    });
  }
}); // Wait for SVG animation (6s)

// ----------------------
// Import GLSL shader strings from a separate module. This uses ES Modules
// The imported values are plain strings that contain the GLSL code for each shader.
import {
    simulationVertexShader,
    simulationFragmentShader,
    renderFragmentShader,
    renderVertexShader,
} from "./shader.js";

// Wait until the DOM (page structure) is fully loaded before running WebGL/Three.js setup.
// This ensures elements like document.body exist and that the page is ready.
document.addEventListener("DOMContentLoaded", () => {

    // ---------- Scenes ----------
    // A Three.js Scene is a container for objects we want to render.
    // We use two scenes:
    // - simScene: renders the "simulation" pass that calculates water pressure/velocity into a render target.
    // - scene: renders the final output (distorted texture) to the screen.
    const scene = new THREE.Scene();
    const simScene = new THREE.Scene();

    // ---------- Camera ----------
    // We use an OrthographicCamera because we're rendering full-screen 2D quads,
    // not a perspective 3D scene. This camera maps coordinates directly to clip space.
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // ---------- Renderer ----------
    // Create the WebGL renderer which draws our scenes to a <canvas> element.
    // - antialias: smooths edges (may be turned off for performance).
    // - alpha: allows the canvas background to be transparent.
    // - preserveDrawingBuffer: keeps pixels after rendering (useful for screenshots),
    //   but slows performance and increases memory 
    const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
    });

    // setPixelRatio helps make rendering crisp on high-DPI screens (retina).
    // I cap it at 2 to avoid huge render targets that destroy performance.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Set the canvas size in CSS pixels (renderer will create backing store accordingly).
    renderer.setSize(window.innerWidth, window.innerHeight);

    // Add the renderer's DOM canvas element to the page so it's visible.
    document.querySelector(".hero").appendChild(renderer.domElement);

    // ---------- Interaction tracking ----------
    // I'll store the mouse position in the same format our shader expects (pixel coordinates).
    // THREE.Vector2 is a small 2D vector helper class.
    const mouse = new THREE.Vector2();

    // frame will count frames and be passed to the shader so it can behave differently on frame 0.
    let frame = 0;

    // ---------- Render Target (ping-pong) sizes ----------
    // We choose to back the simulation textures by the screen size * devicePixelRatio,
    // so the simulation has one physical pixel per screen device pixel (sharp results).
    // NOTE: large DPR values make big textures → big memory & GPU cost.
    const width = window.innerWidth * window.devicePixelRatio;
    const height = window.innerHeight * window.devicePixelRatio;

    // Options for the render targets (offscreen textures where we render simulation results).
    // - type: THREE.FloatType lets us store floating point numbers in the texture, which is useful for precise physics state.
    //   Some browsers/devices require extensions for float textures; be aware for broad compatibility.
    const options = {
        format: THREE.RGBAFormat,
        type: THREE.FloatType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        stencilBuffer: false,
        depthBuffer: false,
    };

    // Create two render targets to ping-pong between them each frame:
    // - rtA holds the "current" state
    // - rtB will receive the next state when we run the simulation shader
    let rtA = new THREE.WebGLRenderTarget(width, height, options);
    let rtB = new THREE.WebGLRenderTarget(width, height, options);

    // ---------- Simulation material ----------
    // This shader updates the fluid/wave state (pressure, velocity, gradients).
    // We supply it with uniforms (inputs) that can change every frame.
    const simMaterial = new THREE.ShaderMaterial({
        uniforms: {
            // textureA: previous simulation texture (we'll set this every frame)
            textureA: { value: null },

            // mouse: a vec2 with mouse coordinates in pixel space used to inject ripples
            mouse: { value: mouse },

            // resolution: screen resolution in pixels (vec2)
            resolution: { value: new THREE.Vector2(width, height) },

            // time: floating time in seconds (optional, useful for animations)
            time: { value: 0 },

            // frame: integer frame count (we use this to initialize the first pass on frame == 0)
            frame: { value: 0 },
        },
        vertexShader: simulationVertexShader,
        fragmentShader: simulationFragmentShader,
    });

    // ---------- Render (visual) material ----------
    // This shader reads the simulation texture to compute distortions and samples the
    // "background" texture (the canvas with text) to produce the final pixels we show.
    const renderMaterial = new THREE.ShaderMaterial({
        uniforms: {
            textureA: { value: null }, // simulation texture (contains pressure/gradients)
            textureB: { value: null }, // source image / text texture (the thing to distort)
        },
        vertexShader: renderVertexShader,
        fragmentShader: renderFragmentShader,
        // 'transparent: true' allows alpha blending if needed.
        transparent: true,
    });

    // ---------- Quad geometry ----------
    // We render 2D fullscreen quads (plane of size 2x2 in clip space) for both passes.
    // Because the camera is orthographic and spans [-1,1], a plane of size (2,2) fills the screen.
    const plane = new THREE.PlaneGeometry(2, 2);

    // Mesh for the simulation pass (attached to simScene).
    // When simScene is rendered with simMaterial, it writes into a render target instead of the screen.
    const simQuad = new THREE.Mesh(plane, simMaterial);

    // Mesh for the final render pass (attached to scene).
    // It samples the simulation texture and the source texture, and is drawn to the screen.
    const renderQuad = new THREE.Mesh(plane, renderMaterial);

    simScene.add(simQuad);
    scene.add(renderQuad);

    // ---------- Prepare a CanvasTexture (for writing text/background) ----------
    // We can draw text and backgrounds on a normal 2D <canvas>, then turn that into a THREE texture.
    // This makes it easy to compose text and then distort it in the shader.
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    // 2D drawing context; alpha:true allows transparent pixels.
    const ctx = canvas.getContext("2d", { alpha: true });

    // Fill the canvas background with a color first.
    ctx.fillStyle = "#141414";
    ctx.fillRect(0, 0, width, height);

    // Choose a font size scaled by devicePixelRatio for crisp text on high-DPI screens.
    // Note: the font must be available on the system (or loaded via @font-face) to render correctly.
    const fontSize = Math.round(80 * window.devicePixelRatio);
    ctx.fillStyle = "#f9f4eb";
    ctx.font = `bold ${fontSize}px Roboto Condensed`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // These are optional quality settings for some browsers.
    ctx.textRendering = "geometricPrecision";
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // Draw the text centered on the canvas. We use the canvas dimensions (pixel coordinates).
    ctx.fillText("Say Hello to the Fairy Tern's Home!", width / 2, height / 2);

    // Create a Three.js texture from the canvas we just drew.
    // When you modify the canvas later, set textTexture.needsUpdate = true so Three.js updates the GPU texture.
    const textTexture = new THREE.CanvasTexture(canvas);
    textTexture.minFilter = THREE.LinearFilter;
    textTexture.magFilter = THREE.LinearFilter;
    textTexture.format = THREE.RGBAFormat;

    // ---------- Handle window resize ----------
    // We must update renderer size, render target sizes, shader uniform for resolution,
    // and the canvas texture whenever the window size changes.
    window.addEventListener("resize", () => {
        // Compute new sizes in device pixels.
        const newWidth = window.innerWidth * window.devicePixelRatio;
        const newHeight = window.innerHeight * window.devicePixelRatio;

        // Update the onscreen canvas element (renderer) size in CSS pixels.
        renderer.setSize(window.innerWidth, window.innerHeight);

        // Resize the offscreen render targets (they store the simulation state in pixel units).
        rtA.setSize(newWidth, newHeight);
        rtB.setSize(newWidth, newHeight);

        // Update the resolution uniform the shader uses to compute neighbor offsets, mouse mapping, etc.
        // NOTE: the uniform was named 'resolution' in the shader, so we set simMaterial.uniforms.resolution.value.
        simMaterial.uniforms.resolution.value.set(newWidth, newHeight);

        // Resize and redraw the source canvas that supplies the text/image being distorted.
        canvas.width = newWidth;
        canvas.height = newHeight;

        ctx.fillStyle = "#141414";
        ctx.fillRect(0, 0, newWidth, newHeight);

        // Pick a font size appropriate for the new device pixel size.
        const newFontSize = Math.round(250 * window.devicePixelRatio);
        ctx.fillStyle = "black";
        ctx.font = `bold ${newFontSize}px Roboto Condensed`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // IMPORTANT: use the *new* canvas size here — previously this was using stale width/height.
        ctx.fillText("TheFairyTern", newWidth / 2, newHeight / 2);

        // Tell Three.js that the canvas content changed and the GPU texture must be re-uploaded.
        textTexture.needsUpdate = true;
    });

    // ---------- Mouse interaction ----------
    // Map mouse coordinates from client/screen space to the pixel coordinates expected by the shader.
    // Note: in many shader implementations, the origin (0,0) is bottom-left. Here the shader expects
    // mouse in pixel units where y=0 is bottom, so we flip the Y coordinate.
    renderer.domElement.addEventListener("mousemove", (e) => {
        mouse.x = e.clientX * window.devicePixelRatio;
        mouse.y = (window.innerHeight - e.clientY) * window.devicePixelRatio;
    });

    // When the cursor leaves the canvas, reset mouse to (0,0) to stop new disturbances.
    renderer.domElement.addEventListener("mouseleave", () => {
        mouse.set(0, 0);
    });

    // ---------- Animation loop ----------
    // This function executes once per animation frame (~60fps) and:
    // 1) runs the simulation shader into a render target (rtB)
    // 2) renders the final visual pass using the newest simulation texture
    // 3) swaps rtA and rtB (ping-pong) so the next frame uses the updated state
    const animate = () => {
        // Provide frame count and time to the simulation shader.
        simMaterial.uniforms.frame.value = frame++;
        simMaterial.uniforms.time.value = performance.now() / 1000;

        // Tell the simulation shader what the "previous" state texture is.
        simMaterial.uniforms.textureA.value = rtA.texture;

        // 1) Run the simulation: draw simScene (with simQuad+simMaterial) into rtB.
        //    setRenderTarget(rtB) means "render into the texture attached to rtB, not the screen."
        renderer.setRenderTarget(rtB);
        renderer.render(simScene, camera);

        // 2) Prepare the final render pass:
        //    - textureA is the newest simulation (rtB)
        //    - textureB is the source image/text (canvas texture)
        renderMaterial.uniforms.textureA.value = rtB.texture;
        renderMaterial.uniforms.textureB.value = textTexture;

        // Render to the screen by clearing the render target (null -> default framebuffer).
        renderer.setRenderTarget(null);
        renderer.render(scene, camera);

        // 3) Swap rtA and rtB so rtA always points to the latest state for the next frame
        const temp = rtA;
        rtA = rtB;
        rtB = temp;

        // Schedule the next frame.
        requestAnimationFrame(animate);
    };

    // Start the animation loop.
    animate();
});


// Wait until the HTML document is fully loaded before running any of this script.
// `DOMContentLoaded` fires when the DOM is ready (images/styles may still be loading).
document.addEventListener("DOMContentLoaded", () => {

  // ----------------------------
  // Smooth scrolling with Lenis
  // ----------------------------
  const lenis = new Lenis({
    lerp: 0.08,
    wheelMultiplier: 0.7
  });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((time) => {
    lenis.raf(time * 1000);
  });
  gsap.ticker.lagSmoothing(0);

  // ----------------------------
  // DOM ELEMENTS: cache selectors
  // ----------------------------
  // Query important elements once and reuse them for performance.
  const header = document.querySelector(".header h1"); // main header text (used later)
  const textElement1 = document.querySelector(".sticky-text-1 .text-container h1");
  const textElement2 = document.querySelector(".sticky-text-2 .text-container h1");
  const textElement3 = document.querySelector(".sticky-text-3 .text-container h1");
  const textContainer3 = document.querySelector(".sticky-text-3 .text-container");

  // Read a CSS custom property (variable) from :root (documentElement).
  // Here we expect --dark to be a color string like "rgba(0,0,0,1)" or "#000".
  // We call .trim() to remove accidental whitespace.
  const outroTextBgColor = getComputedStyle(document.documentElement)
    .getPropertyValue("--dark")
    .trim();

  // ----------------------------
  // Optional: Split header into words (SplitText plugin)
  // ----------------------------
  // SplitText is a GSAP plugin that splits text into words/letters for individual animation.
  // We check that the header exists first, then split it into words and hide them initially.
  let headerSplit = null;
  if (header) {
    // Create a SplitText instance that wraps words in elements with the class "spotlight-word".
    headerSplit = SplitText.create(header, {
      type: "words",
      wordsClass: "spotlight-word",
    });
    // Hide every word initially (opacity 0). We'll reveal them later in a specific scroll range.
    gsap.set(headerSplit.words, { opacity: 0 });
  }

  // ----------------------------
  // SCALE PRECALC: compute how much to scale text to fill the section.
  // ----------------------------
  // targetScales will store the scale we want for each sticky text block (1..3).
  // We calculate sectionHeight / textHeight so we can scale the text to fit the section.
  const targetScales = [];

  function calculateDynamicScale() {
    // Loop 1..3 to match .sticky-text-1, .sticky-text-2, .sticky-text-3
    for (let i = 1; i <= 3; i++) {
      const section = document.querySelector(`.sticky-text-${i}`);
      const text = document.querySelector(`.sticky-text-${i} .text-container h1`);

      // If the DOM doesn't contain this section/text, skip it safely.
      if (!section || !text) continue;

      // offsetHeight gives the visible height (integer px) including padding & borders.
      // We divide section height by the text's current height to compute the target scale.
      const sectionHeight = section.offsetHeight;
      const textHeight = text.offsetHeight;
      targetScales[i - 1] = sectionHeight / textHeight;
      // Note: If textHeight is zero (hidden element), this will produce Infinity. Ensure elements are visible.
    }
  }

  // Calculate target scales initially, and recalc on window resize so values stay accurate.
  calculateDynamicScale();
  window.addEventListener("resize", calculateDynamicScale);

  // Small helper to set a vertical scale using CSS transform.
  // Using transforms is performant (GPU-accelerated) compared to changing width/height directly.
  function setScaleY(element, scale) {
    element.style.transform = `scaleY(${scale})`;
  }

  // ----------------------------
  // SCROLLTRIGGER: sticky-text-1 (scale in)
  // ----------------------------
  // This ScrollTrigger watches the top of .sticky-text-1 move from "bottom" of viewport
  // to "top" of viewport. As scroll moves through that range, we progressively scale the text.
  ScrollTrigger.create({
    trigger: ".sticky-text-1",
    // start when the top of the trigger reaches the bottom of the viewport
    start: "top bottom",
    // end when the top of the trigger reaches the top of the viewport
    end: "top top",
    // scrub smooths the animation to the scrollbar — the number would make it dampened;
    // `1` is a mild smoothing. Setting true would tie directly to scroll (no easing).
    scrub: 1,
    onUpdate: (self) => {
      // self.progress is a number 0 → 1 indicating how far through the start→end range we are.
      const currentScale = targetScales[0] * self.progress;
      setScaleY(textElement1, currentScale);
    },
  });

  // ----------------------------
  // SCROLLTRIGGER: sticky-text-1 (pin while scaling out)
  // ----------------------------
  // Pin the section in place (sticky effect) while the next scroll segment plays.
  ScrollTrigger.create({
    trigger: ".sticky-text-1",
    start: "top top", // start pin when the top of the section reaches top of viewport
    end: `+=${window.innerHeight * 1}px`, // pin for the height of one viewport (you used * 1)
    pin: true, // pin the trigger element in place
    pinSpacing: false, // remove the extra pin spacing (you don't want added blank space)
    scrub: 1,
    onUpdate: (self) => {
      // Reverse scale from full size back to collapsed while pinned.
      const currentScale = targetScales[0] * (1 - self.progress);
      setScaleY(textElement1, currentScale);
    },
  });

  // ----------------------------
  // SCROLLTRIGGER: sticky-text-2 (scale in & pin)
  // ----------------------------
  ScrollTrigger.create({
    trigger: ".sticky-text-2",
    start: "top bottom",
    end: "top top",
    scrub: 1,
    onUpdate: (self) => {
      const currentScale = targetScales[1] * self.progress;
      setScaleY(textElement2, currentScale);
    },
  });

  ScrollTrigger.create({
    trigger: ".sticky-text-2",
    start: "top top",
    end: `+=${window.innerHeight * 1}px`,
    pin: true,
    pinSpacing: false,
    scrub: 1,
    onUpdate: (self) => {
      const currentScale = targetScales[1] * (1 - self.progress);
      setScaleY(textElement2, currentScale);
    },
  });

  // ----------------------------
  // SCROLLTRIGGER: sticky-text-3 (more complex transformations)
  // ----------------------------
  // This block scales the text container up massively, fades its background color,
  // fades its content, and reveals header words in a range near the very end.
  ScrollTrigger.create({
    trigger: ".sticky-text-3",
    start: "top bottom",
    end: "top top",
    scrub: 1,
    onUpdate: (self) => {
      const currentScale = targetScales[2] * self.progress;
      setScaleY(textElement3, currentScale);
    },
  });

  ScrollTrigger.create({
    trigger: ".sticky-text-3",
    start: "top top",
    // pin for 4 * viewport height (this gives a long scroll area to animate through)
    end: `+=${window.innerHeight * 4}px`,
    pin: true,
    pinSpacing: true, // allow space after pin so the page continues to scroll
    scrub: 1,
    onUpdate: (self) => {
      // self.progress -> 0..1 for the pin's start→end range
      const progress = self.progress;

      // Initialize background & opacity at the start (progress = 0)
      if (progress === 0) {
        // ensure the right BG color & opacity when starting
        textContainer3.style.backgroundColor = outroTextBgColor;
        textContainer3.style.opacity = 1;
      }

      // Scale up the entire container smoothly up to 10x.
      // For first 75% of the pinned range, we interpolate scale from 1 → 10.
      if (progress <= 0.75) {
        const scaleProgress = progress / 0.75; // 0..1
        const currentScale = 1 + 9 * scaleProgress; // 1..10
        // scale3d maintains both X & Y scales (we keep Z as 1). This makes a uniform grow.
        textContainer3.style.transform = `scale3d(${currentScale}, ${currentScale}, 1)`;
      } else {
        // After 75% of the range, keep the scale fixed at 10.
        textContainer3.style.transform = `scale3d(10, 10, 1)`;
      }

      // Background fade-out:
      // We expect outroTextBgColor to be in a format like "rgba(r,g,b,1)" so we can replace the alpha.
      // If you store colors as hex (#000) this replace won't work — consider normalizing to rgba in CSS.
      if (progress < 0.25) {
        // keep full background up until 25%
        textContainer3.style.backgroundColor = outroTextBgColor;
        textContainer3.style.opacity = 1;
      } else if (progress >= 0.25 && progress <= 0.5) {
        // between 25% and 50% we progressively reduce the alpha of the background color
        const fadeProgress = (progress - 0.25) / 0.25; // 0..1
        const bgOpacity = Math.max(0, Math.min(1, 1 - fadeProgress)); // clamp 0..1
        // naive string replace: assumes outroTextBgColor ends with "1)" like "rgba(x,x,x,1)"
        // If outroTextBgColor is not rgba(...,1) this will fail silently.
        textContainer3.style.backgroundColor = outroTextBgColor.replace(
          "1)", `${bgOpacity})`
        );
      } else if (progress > 0.5) {
        // after 50% background is fully transparent
        textContainer3.style.backgroundColor = outroTextBgColor.replace(
          "1)", "0)"
        );
      }

      // Text fade-out for the container: between 50% and 75% fade to 0.
      if (progress >= 0.5 && progress <= 0.75) {
        const textProgress = (progress - 0.5) / 0.25; // 0..1
        const textOpacity = 1 - textProgress;
        textContainer3.style.opacity = textOpacity;
      } else if (progress > 0.75) {
        textContainer3.style.opacity = 0;
      }

      // Reveal header words (SplitText) after container has mostly zoomed — ~75% to ~95%
      if (headerSplit && headerSplit.words.length > 0) {
        // NOTE: fixed a small typo from your original code here — `progres` -> `progress`
        if (progress >= 0.75 && progress <= 0.95) {
          // textProgress goes 0..1 across the 75%..95% window (a 20% range)
          const textProgress = (progress - 0.75) / 0.2;
          const totalWords = headerSplit.words.length;

          // For each word, we reveal it when the scroll progress passes a threshold
          headerSplit.words.forEach((word, index) => {
            // wordRevealProgress is the fraction of the way through the words we are
            const wordRevealProgress = index / totalWords;
            // The word is visible when textProgress >= its reveal threshold
            const opacity = textProgress >= wordRevealProgress ? 1 : 0;
            gsap.set(word, { opacity });
          });
        } else if (progress < 0.75) {
          // Before the reveal window, make sure all header words are hidden.
          gsap.set(headerSplit.words, { opacity: 0 });
        } else if (progress > 0.95) {
          // After the reveal window, ensure all words are visible.
          gsap.set(headerSplit.words, { opacity: 1 });
        }
      }
    },
  });
});

// -----------------------------------------------------------
// SECOND DOMContentLoaded: sticky "cards" 3D/scroll interactions
// -----------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  // Convert the NodeList of .card elements into a real array for convenience
  const cards = gsap.utils.toArray(".card");

  // Iterate through each card except the last (since the animation references the next card)
  cards.forEach((card, index) => {
    if (index < cards.length - 1) {
      // cardInner is the element we animate inside the card (the visible face)
      const cardInner = card.querySelector(".card-inner");

      // Animate cardInner from y: 0% -> y: -50% and rotate it slightly as the next card scrolls.
      // We use scrollTrigger inside the fromTo so the animation is linked to scroll progress.
      gsap.fromTo(cardInner, {
        y: "0%",     // starting vertical position (no offset)
        z: 0,        // starting Z translation
        rotationX: 0 // starting 3D rotation
      }, {
        y: "-50%",   // move up by 50% of its own height
        z: -250,     // translate backwards in Z (creates depth)
        rotationX: 45, // tilt backwards
        scrollTrigger: {
          // The animation is controlled by the position of the *next* card in the DOM.
          // When the next card's top hits 85% from the top of the viewport -> start,
          // and end when its top is -75% (above the viewport).
          trigger: cards[index + 1],
          start: "top 85%",
          end: "top -75%",
          scrub: true, // tie the animation progress to the scrollbar (smooth)
          pin: card,   // pin the current card in place while the animation runs
          pinSpacing: false, // don't add extra space during the pin
        }
      });

      // Animate a CSS variable --after-opacity from its current value to 1 as the next card scrolls.
      // This is a neat trick to animate pseudo-elements (::after) by controlling a CSS variable.
      gsap.to(cardInner, {
        "--after-opacity": 1,
        scrollTrigger: {
          trigger: cards[index + 1],
          start: "top 75%",
          end: "top -25%",
          scrub: true,
        },
      });
    }
  });
});

let activeIndex = 0;
const slides = document.getElementsByTagName("article");

const handleLeftClick = () => {
    const nextIndex = activeIndex - 1 >= 0 ? activeIndex - 1 : slides.length - 1;

    const currentSlide = document.querySelector(`[data-index="${activeIndex}"]`),
        nextSlide = document.querySelector(`[data-index="${nextIndex}"]`);
    currentSlide.dataset.status = "after";

    nextSlide.dataset.status = "becoming-active-from-before";

    setTimeout(() => {
        nextSlide.dataset.status = "active";
        activeIndex = nextIndex;
    });
}

const handleRightClick = () => {
    const nextIndex = activeIndex + 1 <= slides.length - 1 ? activeIndex + 1 : 0;

    const currentSlide = document.querySelector(`[data-index="${activeIndex}"]`),
        nextSlide = document.querySelector(`[data-index="${nextIndex}"]`);

    currentSlide.dataset.status = "before";

    nextSlide.dataset.status = "becoming-active-from-after";

    setTimeout(() => {
        nextSlide.dataset.status = "active";
        activeIndex = nextIndex;
    });
}

/* -- Mobile Nav Toggle Placeholder -- */
const nav = document.querySelector("nav");

const handleNavToggle = () => {
    nav.dataset.transitionable = "true";

    nav.dataset.toggled = nav.dataset.toggled === "true" ? "false" : "true";
}

// Expose a dummy toggleNav for the button click (since your HTML calls it)
const toggleNav = () => console.log("Nav toggle clicked");


window.matchMedia("(max-width: 800px)").onchange = e => {
    nav.dataset.transitionable = "false";

    nav.dataset.toggled = "false";
};


const trailer = document.getElementById("trailer");

window.onmousemove = e => {
    const x = e.clientX - trailer.offsetWidth / 2,
        y = e.clientY - trailer.offsetHeight / 2;

    const keyframes = {
        transform: `translate(${x}px, ${y}px)`
    }

    trailer.animate(keyframes, {
        duration: 800,
        fill: "forwards"
    });
}

// Handle mouseover animation placeholder (was missing an element selector)
// document.querySelector("").onmouseover = (event) => { /* ... */ };


document.addEventListener("DOMContentLoaded", () => {
    // Register ScrollTrigger plugin (good practice when included)
    gsap.registerPlugin(ScrollTrigger);

    const container = document.querySelector(".container")
    const menuToggle = document.querySelector(".menu-toggle")
    const menuOverlay = document.querySelector(".menu-overlay")
    const menuContent = document.querySelector(".menu-content")
    const menuPreviewImg = document.querySelector(".menu-preview-img")
    const menuLinks = document.querySelectorAll(".link a")

    let isOpen = false;
    let isAnimating = false;

    // *** FIX: Set the consistent initial state using GSAP.set() ***
    // This is the new hidden start position for the menu, replacing the aggressive CSS.
    gsap.set(menuContent, {
        rotation: -15, // Consistent starting rotation (less aggressive than -150)
        x: -100,
        y: -100,
        scale: 1.5,
        opacity: 0.25
    });

    menuToggle.addEventListener("click", () => {
        if (!isOpen) openMenu();
        else closeMenu();
    });

    function cleanupPreviewImages() {
        const previewImages = menuPreviewImg.querySelectorAll("img");
        if (previewImages.length > 0 && previewImages.length - 1 > 0) {
            for (let i = 0; i < previewImages.length - 1; i++) {
                menuPreviewImg.removeChild(previewImages[i]);
            }
        }
    }

    function resetPreviewImage() {
        menuPreviewImg.innerHTML = "";
        const defaultPreviewImg = document.createElement("img");
        // NOTE: Using a placeholder image since public/beach.jpg isn't available
        defaultPreviewImg.src = "https://placehold.co/1000x800/222222/FFFFFF?text=Menu+Preview";
        menuPreviewImg.appendChild(defaultPreviewImg);
    }

    function animateMenuToggle(isOpening) {
        const open = document.querySelector("p#menu-open");
        const close = document.querySelector("p#menu-close");

        gsap.to(isOpening ? open : close, {
            x: isOpening ? -5 : 5,
            y: isOpening ? -10 : 10,
            rotation: isOpening ? -5 : 5,
            opacity: 0,
            delay: 0.25,
            duration: 0.5,
            ease: "power2.out",
        });

        gsap.to(isOpening ? close : open, {
            x: 0,
            y: 0,
            rotation: 0,
            opacity: 1,
            delay: 0.5,
            duration: 0.5,
            ease: "power2.out",
        });
    }

    function openMenu() {
        if (isAnimating || isOpen) return;
        isAnimating = true;

        // Seamless Peel Animation: Large rotation combined with translation
        gsap.to(container, {
            rotation: 45,
            x: -1200,
            y: 900,
            scale: 0.7,
            duration: 1.25,
            ease: "power4.inOut",
        });

        animateMenuToggle(true);

        // This now animates consistently from the state set by gsap.set()
        gsap.to(menuContent, {
            rotation: 0,
            x: 0,
            y: 0,
            scale: 1,
            opacity: 1,
            duration: 1.25,
            ease: "power4.inOut",
        });

        gsap.to([".link a", ".social a"], {
            y: "0%",
            opacity: 1,
            duration: 1,
            delay: 0.75,
            stagger: 0.1,
            ease: "power3.out"
        });

        gsap.to(menuOverlay, {
            clipPath: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)",
            duration: 1.25,
            ease: "power4.inOut",
            onComplete: () => {
                isOpen = true;
                isAnimating = false;
            },
        });
    }

    function closeMenu() {
        if (isAnimating || !isOpen) return;
        isAnimating = true;

        // Return container to original position (reverse of openMenu)
        gsap.to(container, {
            rotation: 0,
            x: 0,
            y: 0,
            scale: 1,
            duration: 1.25,
            ease: "power4.inOut",
        });

        animateMenuToggle(false);

        // Close menu animates back to the consistent starting state
        gsap.to(menuContent, {
            rotation: -15,
            x: -100,
            y: -100,
            scale: 1.5,
            opacity: 0.25,
            duration: 1.25,
            ease: "power4.inOut",
        });

        gsap.to(menuOverlay, {
            clipPath: "polygon(0% 0%, 100% 0%, 100% 0%, 0% 0%)",
            duration: 1.25,
            ease: "power4.inOut",
            onComplete: () => {
                isOpen = false;
                isAnimating = false;
                // Set the link initial state for the next open
                gsap.set([".link a", ".social a"], {
                    y: "120%"
                });
                resetPreviewImage();
            },
        });
    }

    menuLinks.forEach((link) => {
        link.addEventListener("mouseover", () => {
            if (!isOpen || isAnimating) return;

            const imgSrc = link.getAttribute("data-img")
            if (!imgSrc) return;

            const previewImages = menuPreviewImg.querySelectorAll("img");
            if (previewImages.length > 0 && previewImages[previewImages.length - 1].src.endsWith(imgSrc)) return;

            const newPreviewImg = document.createElement("img");
            // NOTE: Using a placeholder image since public/beach.jpg isn't available
            newPreviewImg.src = imgSrc;
            newPreviewImg.style.opacity = "0";
            newPreviewImg.style.transform = "scale(1.25) rotate(10deg)";

            menuPreviewImg.appendChild(newPreviewImg);
            cleanupPreviewImages();

            gsap.to(newPreviewImg, {
                opacity: 1,
                scale: 1,
                rotation: 0,
                duration: 0.75,
                ease: "power2.out"
            });
        });
    });

    // Set initial state for trailer image
    resetPreviewImage();
});