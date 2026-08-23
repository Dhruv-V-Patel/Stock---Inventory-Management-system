const loginForm = document.getElementById("loginForm");

const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");

const usernameError = document.getElementById("usernameError");
const passwordError = document.getElementById("passwordError");

const passwordToggle = document.getElementById("passwordToggle");
const passwordIcon = document.getElementById("passwordIcon");

const loginButton = document.getElementById("loginButton");
const loginButtonText = document.getElementById("loginButtonText");
const loginSpinner = document.getElementById("loginSpinner");

const loginMessage = document.getElementById("loginMessage");

const currentYear = document.getElementById("currentYear");

const sliderDots = document.querySelectorAll(".dot");

/* =========================
   CURRENT YEAR
========================= */

currentYear.textContent = new Date().getFullYear();

/* =========================
   PASSWORD TOGGLE
========================= */

passwordToggle.addEventListener("click", () => {
  const isPassword = passwordInput.type === "password";

  passwordInput.type = isPassword ? "text" : "password";

  passwordIcon.classList.toggle("fa-eye-slash", !isPassword);

  passwordIcon.classList.toggle("fa-eye", isPassword);

  passwordToggle.setAttribute(
    "aria-label",
    isPassword ? "Hide password" : "Show password",
  );
});

/* =========================
   CLEAR INPUT ERROR
========================= */

const clearInputError = (input, errorElement) => {
  input.classList.remove("input-error");

  errorElement.textContent = "";
};

usernameInput.addEventListener("input", () => {
  clearInputError(usernameInput, usernameError);
});

passwordInput.addEventListener("input", () => {
  clearInputError(passwordInput, passwordError);
});

/* =========================
   VALIDATION
========================= */

const validateForm = () => {
  const username = usernameInput.value.trim();

  const password = passwordInput.value;

  let isValid = true;

  clearInputError(usernameInput, usernameError);

  clearInputError(passwordInput, passwordError);

  if (!username) {
    usernameError.textContent = "Please Enter Username.";

    usernameInput.classList.add("input-error");

    isValid = false;
  }

  if (!password) {
    passwordError.textContent = "Please Enter Password.";

    passwordInput.classList.add("input-error");

    isValid = false;
  }

  return isValid;
};

/* =========================
   LOADING STATE
========================= */

const setLoading = (isLoading) => {
  loginButton.disabled = isLoading;

  loginButtonText.textContent = isLoading ? "Signing in..." : "Login";

  loginSpinner.style.display = isLoading ? "inline-block" : "none";
};

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  usernameError.textContent = "";
  passwordError.textContent = "";
  loginMessage.textContent = "";

  let isValid = true;

  if (!username) {
    usernameError.textContent = "Please enter your email or mobile number.";

    isValid = false;
  }

  if (!password) {
    passwordError.textContent = "Please enter your password.";

    isValid = false;
  }

  if (!isValid) {
    return;
  }

  loginButton.disabled = true;
  loginButtonText.textContent = "Logging in...";

  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        username,
        password,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Login failed.");
    }

    // Save JWT
    localStorage.setItem("accessToken", data.loginToken); 
    localStorage.setItem("accessTokenCreatedAt", Date.now().toString());
    localStorage.setItem("user", JSON.stringify(data.user));
    // sessionStorage.removeItem("pinVerified");

  
      window.location.href = "/";
  } catch (error) {
    loginMessage.textContent = error.message;
    loginMessage.className = "login-message error";
  } finally {
    loginButton.disabled = false;
    loginButtonText.textContent = "Login";
  }
});
/* =========================
   SLIDER DOTS
========================= */

sliderDots.forEach((dot) => {
  dot.addEventListener("click", () => {
    sliderDots.forEach((item) => item.classList.remove("active"));

    dot.classList.add("active");
  });
});
