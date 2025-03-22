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
    const dots = document.querySelectorAll('.carousel-dots .dot');
    let currentSlide = 0;

    function showSlide(index) {
        slides.forEach((slide, i) => {
            slide.style.display = (i >= index && i < index + 2) ? 'block' : 'none'; // Display two reviews at a time
        });
        dots.forEach((dot, i) => {
            dot.classList.toggle('active', i === Math.floor(index / 2));
        });
    }

    function moveSlide(n) {
        currentSlide = (currentSlide + n + slides.length) % slides.length;
        showSlide(currentSlide);
    }

    function autoRotateSlides() {
        moveSlide(2); // Move by 2 to show the next set of two reviews
    }

    dots.forEach((dot, index) => {
        dot.addEventListener('click', () => {
            moveSlide(index * 2 - currentSlide);
        });
    });

    showSlide(currentSlide);

    setInterval(autoRotateSlides, 5000); // Change slide every 5 seconds
});
