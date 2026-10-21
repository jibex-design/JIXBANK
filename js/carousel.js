// Auto-playing carousel for the sign-up and login pages

const slides = document.querySelectorAll(".slide");
const dots = document.querySelectorAll(".dot");
const captionTitle = document.getElementById("captionTitle");
const captionText = document.getElementById("captionText");
const carousel = document.getElementById("carousel");

const captions = [
  { title: "Banking Made Simple", text: "Send, save and spend with confidence. Everything you need is in one place." },
  { title: "Save Towards Your Goals", text: "Create savings goals and watch your progress grow every week." },
  { title: "Fast and Easy Transfers", text: "Send money to friends and family in just a few taps." },
  { title: "Your Security Matters", text: "Your account is protected so you can bank with peace of mind." },
  { title: "Pay Bills Anywhere", text: "Buy airtime, data and more from your phone, anytime." }
];

let current = 0;
let timer = null;

function showSlide(index) {
  slides.forEach((s) => s.classList.remove("active"));
  dots.forEach((d) => d.classList.remove("active"));

  current = index;
  slides[current].classList.add("active");
  dots[current].classList.add("active");

  captionTitle.textContent = captions[current].title;
  captionText.textContent = captions[current].text;
}

function nextSlide() {
  showSlide((current + 1) % slides.length); // % loops back to 0 after the last slide
}

function startAutoPlay() {
  stopAutoPlay();
  timer = setInterval(nextSlide, 4000); // every 4 seconds
}

function stopAutoPlay() {
  clearInterval(timer);
}

dots.forEach((dot, index) => {
  dot.addEventListener("click", () => {
    showSlide(index);
    startAutoPlay();
  });
});

carousel.addEventListener("mouseenter", stopAutoPlay);
carousel.addEventListener("mouseleave", startAutoPlay);

showSlide(0);
startAutoPlay();
