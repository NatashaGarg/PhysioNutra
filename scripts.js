let currentIndex = 0;
const images = document.querySelectorAll('.carousel img');

function showNextImage() {
    images[currentIndex].classList.remove('active');
    currentIndex = (currentIndex + 1) % images.length;
    images[currentIndex].classList.add('active');
}

setInterval(showNextImage, 3000);

document.getElementById('appointment-form').addEventListener('submit', function(event) {
    alert('Appointment booked successfully!');
    // The form will be submitted to Google Forms
});
