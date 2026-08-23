let userEmail = "";
let countdown = null;
let seconds = 300;

/* ==========================================================
   DOM
========================================================== */

const emailForm = document.getElementById("emailForm");
const otpForm = document.getElementById("otpForm");
const resetForm = document.getElementById("resetForm");

const successBox = document.getElementById("successBox");

const emailInput = document.getElementById("email");

const passwordInput = document.getElementById("password");
const confirmPasswordInput = document.getElementById("confirmPassword");

const resendBtn = document.getElementById("resendBtn");
const countdownElement = document.getElementById("countdown");

const otpInputs = [...document.querySelectorAll(".otp-input")];

/* ========== POPUP DOM ========== */
const popupOverlay = document.getElementById("popupOverlay");
const popupIcon = document.getElementById("popupIcon");
const popupTitle = document.getElementById("popupTitle");
const popupMessage = document.getElementById("popupMessage");
const popupBtn = document.getElementById("popupBtn");

/* ==========================================================
   Helpers
========================================================== */

document.getElementById("backToLogin").addEventListener("click", (event) => {
    event.preventDefault();
    window.location.href = "/login"; // Change to your login page path
});
document.getElementById("backToForgot").addEventListener("click", () => {

    clearInterval(countdown);
    clearOTP();
    showStep("email");
    emailInput.focus();

  });
const showStep = (step) => {
  emailForm.classList.add("hidden");
  otpForm.classList.add("hidden");
  resetForm.classList.add("hidden");
  successBox.classList.add("hidden");

  switch (step) {
    case "email":
      emailForm.classList.remove("hidden");
      break;

    case "otp":
      otpForm.classList.remove("hidden");
      break;

    case "reset":
      resetForm.classList.remove("hidden");
      break;

    case "success":
      successBox.classList.remove("hidden");
      break;
  }
};

/* ========== POPUP FUNCTIONS (REPLACES ALERT) ========== */
const showPopup = (message, type = "info", title = null) => {
  const icons = {
    success: "fa-circle-check",
    error: "fa-circle-xmark",
    info: "fa-circle-info"
  };
  const titles = {
    success: "Success",
    error: "Error",
    info: "Notification"
  };

  popupIcon.className = "popup-icon " + type;
  popupIcon.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i>`;
  popupTitle.textContent = title || titles[type] || titles.info;
  popupMessage.textContent = message;

  popupBtn.className = "popup-btn " + (type === "error" ? "danger" : "primary");

  popupOverlay.classList.add("active");
};

const hidePopup = () => {
  popupOverlay.classList.remove("active");
};

// Close on overlay click
popupOverlay.addEventListener("click", (e) => {
  if (e.target === popupOverlay) hidePopup();
});

// Close on Escape key
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && popupOverlay.classList.contains("active")) {
    hidePopup();
  }
});

const showMessage = (message, type = "info") => {
  showPopup(message, type);
};

const getOTP = () => {
  return otpInputs.map((input) => input.value).join("");
};

const clearOTP = () => {
  otpInputs.forEach((input) => (input.value = ""));

  otpInputs[0].focus();
};

const togglePasswordVisibility = (inputId, button) => {
  const input = document.getElementById(inputId);

  if (!input) return;

  const icon = button.querySelector("i");

  if (input.type === "password") {
    input.type = "text";

    icon.classList.replace("fa-eye", "fa-eye-slash");
  } else {
    input.type = "password";

    icon.classList.replace("fa-eye-slash", "fa-eye");
  }
};

window.togglePasswordVisibility = togglePasswordVisibility;
/* ==========================================================
   OTP INPUT HANDLING
========================================================== */

otpInputs.forEach((input, index) => {
  input.addEventListener("input", (event) => {
    event.target.value = event.target.value.replace(/\D/g, "");

    if (event.target.value && index < otpInputs.length - 1) {
      otpInputs[index + 1].focus();
    }
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Backspace") {
      if (!input.value && index > 0) {
        otpInputs[index - 1].focus();
      }
    }
  });
});

/* ==========================================================
   OTP PASTE SUPPORT
========================================================== */

otpInputs[0].addEventListener("paste", (event) => {
  event.preventDefault();

  const pasted = event.clipboardData
    .getData("text")
    .replace(/\D/g, "")
    .slice(0, 6);

  pasted.split("").forEach((digit, index) => {
    if (otpInputs[index]) {
      otpInputs[index].value = digit;
    }
  });

  if (pasted.length === 6) {
    otpInputs[5].focus();
  }
});

/* ==========================================================
   COUNTDOWN TIMER
========================================================== */

const updateCountdown = () => {
  const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");

  const secs = String(seconds % 60).padStart(2, "0");

  countdownElement.textContent = `Resend code in ${minutes}:${secs}`;
};

const startCountdown = () => {
  clearInterval(countdown);

  seconds = 300;

  resendBtn.disabled = true;

  updateCountdown();

  countdown = setInterval(() => {
    seconds--;

    updateCountdown();

    if (seconds <= 0) {
      clearInterval(countdown);

      resendBtn.disabled = false;

      countdownElement.textContent = "Didn't receive the code?";
    }
  }, 1000);
};

/* ==========================================================
   RESEND OTP
========================================================== */

const resendOTP = async () => {
  if (!userEmail) return;

  resendBtn.disabled = true;

  try {
    const response = await fetch("/api/auth/forgot-password", {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        email: userEmail,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Unable to resend OTP.");
    }

    clearOTP();

    startCountdown();

    showMessage("A new verification code has been sent to your email.", "success");
  } catch (error) {
    resendBtn.disabled = false;

    showMessage(error.message, "error");
  }
};

resendBtn.addEventListener("click", resendOTP);

/* ==========================================================
   SEND VERIFICATION CODE
========================================================== */

const sendVerificationCode = async (event) => {
  event.preventDefault();

  const email = emailInput.value.trim();

  if (!email) {
    showMessage("Please enter your registered email.", "error");
    return;
  }

  const submitBtn = emailForm.querySelector("button[type='submit']");
  const originalHTML = submitBtn.innerHTML;


  try {
    submitBtn.disabled = true;

    submitBtn.innerHTML = `
        <i class="fa-solid fa-spinner fa-spin"></i>
        Sending...
    `;

    const response = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
      }),
    });

    const result = await response.json();

    submitBtn.disabled = false;
    submitBtn.innerHTML = originalHTML;

    if (!response.ok) {
      throw new Error(result.message || "Unable to send verification code.");
    }

    userEmail = email;

    clearOTP();

    startCountdown();

    showStep("otp");

    showMessage(result.message || "Verification code sent successfully.", "success");
  } catch (error) {
    // emailForm.querySelector("button[type='submit']").disabled = false;
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalHTML;
    showMessage(error.message, "error");
  }
};

emailForm.addEventListener("submit", sendVerificationCode);

/* ==========================================================
   VERIFY OTP
========================================================== */

const verifyOTP = async (event) => {
  event.preventDefault();

  const code = getOTP();

  if (code.length !== 6) {
    showMessage("Please enter the 6-digit verification code.", "error");
    return;
  }

  try {
    const submitBtn = otpForm.querySelector("button[type='submit']");
    submitBtn.disabled = true;

    const response = await fetch("/api/auth/verify-reset-code", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: userEmail,
        code,
      }),
    });

    const result = await response.json();

    submitBtn.disabled = false;

    if (!response.ok) {
      throw new Error(result.message || "Invalid verification code.");
    }

    showStep("reset");

    showMessage(result.message || "Verification successful.", "success");
  } catch (error) {
    otpForm.querySelector("button[type='submit']").disabled = false;
    showMessage(error.message, "error");
    clearOTP();
  }
};

otpForm.addEventListener("submit", verifyOTP);
/* ==========================================================
   PASSWORD STRENGTH
========================================================== */

const updatePasswordStrength = () => {
  const password = passwordInput.value;

  let score = 0;

  if (password.length >= 8) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  const fill = document.getElementById("strengthFill");
  const text = document.getElementById("strengthText");

  fill.className = "strength-fill";
  text.className = "strength-text";

  if (!password) {
    fill.style.width = "0%";
    text.textContent = "Password Strength";

    return;
  }

  if (score <= 1) {
    fill.classList.add("strength-very-weak");
    text.classList.add("text-very-weak");
    text.textContent = "Very Weak";
  } else if (score === 2) {
    fill.classList.add("strength-weak");
    text.classList.add("text-weak");
    text.textContent = "Weak";
  } else if (score === 3) {
    fill.classList.add("strength-fair");
    text.classList.add("text-fair");
    text.textContent = "Fair";
  } else if (score === 4) {
    fill.classList.add("strength-good");
    text.classList.add("text-good");
    text.textContent = "Good";
  } else {
    fill.classList.add("strength-strong");
    text.classList.add("text-strong");
    text.textContent = "Strong";
  }
};

passwordInput.addEventListener("input", updatePasswordStrength);

/* ==========================================================
   RESET PASSWORD
========================================================== */

const resetPassword = async (event) => {
  event.preventDefault();

  const password = passwordInput.value.trim();
  const confirmPassword = confirmPasswordInput.value.trim();

  if (!password) {
    showMessage("Please enter a new password.", "error");
    return;
  }

  if (password.length < 8) {
    showMessage("Password must be at least 8 characters.", "error");
    return;
  }

  if (password !== confirmPassword) {
    showMessage("Passwords do not match.", "error");
    return;
  }

  try {
    const submitBtn = resetForm.querySelector("button[type='submit']");

    submitBtn.disabled = true;

    const response = await fetch("/api/auth/reset-password", {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        email: userEmail,

        code: getOTP(),

        password,
      }),
    });

    const result = await response.json();

    submitBtn.disabled = false;

    if (!response.ok) {
      throw new Error(result.message || "Unable to reset password.");
    }

    clearInterval(countdown);

    showStep("success");
  } catch (error) {
    resetForm.querySelector("button[type='submit']").disabled = false;

    showMessage(error.message, "error");
  }
};

resetForm.addEventListener("submit", resetPassword);

/* ==========================================================
   RESET PAGE
========================================================== */

const resetForgotPasswordPage = () => {
  userEmail = "";

  emailInput.value = "";

  passwordInput.value = "";

  confirmPasswordInput.value = "";

  clearOTP();

  clearInterval(countdown);

  seconds = 300;

  updatePasswordStrength();

  showStep("email");
};

/* ==========================================================
   INITIALIZE
========================================================== */

document.addEventListener("DOMContentLoaded", () => {
  showStep("email");
});