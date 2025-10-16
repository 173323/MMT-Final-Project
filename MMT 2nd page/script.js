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
  
  /* -- Mobile Nav Toggle -- */
  
const nav = document.querySelector("nav");
  
const handleNavToggle = () => {  
    nav.dataset.transitionable = "true";
    
    nav.dataset.toggled = nav.dataset.toggled === "true" ? "false" : "true";
}
  
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

// Handle mouseover animation
document.querySelector("").onmouseover = (event) => {
  let iteration = 0;

  clearInterval(interval);

  interval = setInterval(() => {
    const target = event.target;
    target.innerText = target.dataset.value
      .split("")
      .map((letter, index) => {
        if (index < iteration) {
          return target.dataset.value[index];
        }
        return letters[Math.floor(Math.random() * letters.length)];
      })
      .join("");

    if (iteration >= target.dataset.value.length) {
      clearInterval(interval);
    }

    iteration += 1 / 3;
  }, 30);
};


document.addEventListener("DOMContentLoaded", () => {
  const container = document.querySelector(".container")
  const menuToggle = document.querySelector(".menu-toggle")
  const menuOverlay = document.querySelector(".menu-overlay")
  const menuContent = document.querySelector(".menu-content")
  const menuPreviewImg = document.querySelector(".menu-preview-img")
  const menuLinks = document.querySelectorAll(".link a")

  let isOpen = false;
  let isAnimating = false;

  menuToggle.addEventListener("click", ()=>{
    if (!isOpen) openMenu();
    else closeMenu();
  });

  function cleanupPreviewImages(){
    const previewImages = menuPreviewImg.querySelectorAll("img");
    if (previewImages.length > 3){
      for (let i = 0; i < previewImages.length - 3; i++){
        menuPreviewImg.removeChild(previewImages[i]);
      }
    }
  }

  function resetPreviewImage(){
    menuPreviewImg.innerHTML ="";
    const defaultPreviewImg = document.createElement("img");
    defaultPreviewImg.src = "public/beach.jpg";
    menuPreviewImg.appendChild(defaultPreviewImg);
  }

  function animateMenuToggle(isOpening){
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

  function openMenu(){
    if (isAnimating || isOpen) return;
    isAnimating = true;

    gsap.to(container, {
      rotation: 45,
      x: -1200,
      y: 900,
      scale: 0.7,
      duration: 1.25,
      ease: "power4.inOut",
    });

    animateMenuToggle(true);

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
      clipPath: "polygon(0% 0%, 100% 0%, 100% 175%, 0% 100%)",
      duration: 1.25,
      ease: "power4.inOut",
      onComplete: () => {
        isOpen = true;
        isAnimating = false;
      },
    });
  }

  function closeMenu(){
    if (isAnimating || !isOpen) return;
    isAnimating = true;

    gsap.to(container, {
      rotation: 0,
      x: 0,
      y: 0,
      scale: 1,
      duration: 1.25,
      ease: "power4.inOut",
    });

    animateMenuToggle(false);

    gsap.to(menuContent, {
      rotation: -15,
      x: -100,
      y: -100,
      scale: 1.5,
      opacity: 0.25,
      duration: 1.25,
      ease: "power4.inOut",
    });

    gsap.to(menuOverlay,{
      clipPath: "polygon(0% 0%, 100% 0%, 100% 0%, 0% 0%)",
      duration: 1.25,
      ease: "power4.inOut",
      onComplete: () => {
        isOpen = false;
        isAnimating = false;
        gasp.set([".link a", ".social a"], {y: "120%"});
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
});