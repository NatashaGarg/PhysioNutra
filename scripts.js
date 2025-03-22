let currentIndex = 0;
const images = document.querySelectorAll('.carousel img');

function showNextImage() {
    images[currentIndex].classList.remove('active');
    currentIndex = (currentIndex + 1) % images.length;
    images[currentIndex].classList.add('active');
}

setInterval(showNextImage, 3000);

document.getElementById('appointment-form').addEventListener('submit', function(event) {
    alert('You will get a call on your number!');
    // The form will be submitted to Google Forms
});

document.addEventListener("DOMContentLoaded", function() {
    const hamburger = document.querySelector(".hamburger");
    const navMenu = document.querySelector(".nav-menu");
    const callButton = document.getElementById("call-button");
    const header = document.querySelector(".header");

    function toggleHeaderClass() {
        if (window.scrollY > 50) {
            header.classList.add("scrolled");
        } else {
            header.classList.remove("scrolled");
        }
    }

    window.addEventListener("scroll", toggleHeaderClass);

    hamburger.addEventListener("click", function() {
        hamburger.classList.toggle("active");
        navMenu.classList.toggle("active");
    });

    // Reviews Carousel
    const slides = document.querySelectorAll('.carousel-slide .review');
    let currentSlide = 0;

    function showSlide(index) {
        slides.forEach((slide, i) => {
            slide.style.display = i === index ? 'block' : 'none';
        });
    }

    function moveSlide(n) {
        currentSlide = (currentSlide + n + slides.length) % slides.length;
        showSlide(currentSlide);
    }

    function autoRotateSlides() {
        moveSlide(1);
    }

    document.querySelector('.prev').addEventListener('click', () => moveSlide(-1));
    document.querySelector('.next').addEventListener('click', () => moveSlide(1));

    showSlide(currentSlide);

    setInterval(autoRotateSlides, 5000); // Change slide every 5 seconds
});
