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
    const phonePopup = document.getElementById("phone-popup");
    const closePopup = document.getElementById("close-popup");

    hamburger.addEventListener("click", function() {
        hamburger.classList.toggle("active");
        navMenu.classList.toggle("active");
    });

    callButton.addEventListener("click", function() {
        phonePopup.style.display = "block";
    });

    closePopup.addEventListener("click", function() {
        phonePopup.style.display = "none";
    });

    // Close the popup when clicking outside of it
    window.addEventListener("click", function(event) {
        if (event.target == phonePopup) {
            phonePopup.style.display = "none";
        }
    });
});
