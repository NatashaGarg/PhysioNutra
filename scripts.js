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

    hamburger.addEventListener("click", function() {
        hamburger.classList.toggle("active");
        navMenu.classList.toggle("active");
    });
});
