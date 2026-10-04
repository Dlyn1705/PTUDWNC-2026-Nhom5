const scene = document.querySelector(".character-scene");
const characters = [...document.querySelectorAll(".character")];
const emailInput = document.querySelector("#email");
const passwordInput = document.querySelector("#password");
const passwordToggle = document.querySelector("#password-toggle");
const form = document.querySelector("#login-form");
const message = document.querySelector("#form-message");
const googleButton = document.querySelector("#google-sign-in");
const forgotButton = document.querySelector("#forgot-link");

let pointerGaze = { x: 0, y: 0 };

function setMood(mood) {
  scene.dataset.mood = mood;
  if (mood !== "email") {
    characters.forEach((character) => {
      character.style.setProperty("--gaze-x", "0px");
      character.style.setProperty("--gaze-y", "0px");
      character.style.setProperty("--email-tilt", "0deg");
    });
  }
}

function updateEmailMood() {
  if (document.activeElement !== emailInput) return;
  setMood("email");
  const typedProgress = Math.min(emailInput.value.length / 24, 1);
  const typedDirection = emailInput.value.length % 2 === 0 ? 1 : -1;
  const gazeX = pointerGaze.x * 0.68 + typedDirection * typedProgress * 0.32;
  const gazeY = pointerGaze.y * 0.72;

  characters.forEach((character, index) => {
    const characterBias = index % 2 === 0 ? 1 : 0.82;
    character.style.setProperty(
      "--gaze-x",
      `${(gazeX * 4.2 * characterBias).toFixed(1)}px`,
    );
    character.style.setProperty("--gaze-y", `${(gazeY * 3.2).toFixed(1)}px`);
    character.style.setProperty(
      "--email-tilt",
      `${(gazeX * (index % 2 === 0 ? 2.1 : -1.7)).toFixed(1)}deg`,
    );
  });
}

scene.addEventListener("pointermove", (event) => {
  const bounds = scene.getBoundingClientRect();
  pointerGaze = {
    x: Math.max(
      -1,
      Math.min(1, ((event.clientX - bounds.left) / bounds.width - 0.5) * 2),
    ),
    y: Math.max(
      -1,
      Math.min(1, ((event.clientY - bounds.top) / bounds.height - 0.5) * 2),
    ),
  };
  updateEmailMood();
});

scene.addEventListener("pointerleave", () => {
  pointerGaze = { x: 0, y: 0 };
  updateEmailMood();
});

emailInput.addEventListener("focus", () => setMood("email"));
emailInput.addEventListener("input", updateEmailMood);
emailInput.addEventListener("blur", () => {
  window.setTimeout(() => {
    if (document.activeElement === passwordInput) setMood("password");
    else if (document.activeElement !== emailInput) setMood("idle");
  }, 0);
});

passwordInput.addEventListener("focus", () => setMood("password"));
passwordInput.addEventListener("blur", () => {
  window.setTimeout(() => {
    if (
      document.activeElement !== emailInput &&
      document.activeElement !== passwordToggle
    ) {
      setMood("idle");
    }
  }, 0);
});

passwordToggle.addEventListener("pointerdown", (event) =>
  event.preventDefault(),
);
passwordToggle.addEventListener("click", () => {
  const isVisible = passwordInput.type === "text";
  passwordInput.type = isVisible ? "password" : "text";
  passwordToggle.setAttribute("aria-pressed", String(!isVisible));
  passwordToggle.setAttribute(
    "aria-label",
    isVisible ? "Show password" : "Hide password",
  );
  passwordInput.focus();
  setMood("password");
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  message.textContent =
    "This sign-in preview is ready to connect to your authentication service.";
});

googleButton.addEventListener("click", () => {
  message.textContent =
    "Google sign-in is a preview here and needs OAuth credentials to connect.";
});

forgotButton.addEventListener("click", () => {
  message.textContent = "Password recovery is not connected in this preview.";
});
