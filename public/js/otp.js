const otpForm = document.getElementById("otpForm");
const timer = document.getElementById("timer");
const resendBtn = document.getElementById("resendBtn");

const errorBox = document.querySelector(".auth-error");
const successBox = document.querySelector(".auth-success");

let seconds = 60;

let interval = setInterval(() => {
  seconds--;

  timer.textContent = seconds;

  if (seconds <= 0) {
    clearInterval(interval);

    resendBtn.disabled = false;
    resendBtn.style.opacity = "1";
  }
}, 1000);

otpForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (errorBox) {
    errorBox.style.display = "none";
  }

  if (successBox) {
    successBox.style.display = "none";
  }

  const otp = otpForm.otp.value.trim();

  try {
    const response = await fetch("/auth/verify-otp", {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },

      body: JSON.stringify({
        otp
      })
    });

    const result = await response.json();

    if (result.success) {
      window.location.href = result.redirect;
      return;
    }

    if (errorBox) {
      errorBox.innerText = result.message;
      errorBox.style.display = "block";
    }
  } catch (error) {
    console.error(error);

    if (errorBox) {
      errorBox.innerText =
        "Something went wrong. Please try again.";
      errorBox.style.display = "block";
    }
  }
});

const resendForm = document.getElementById("resendOtpForm");

resendForm.addEventListener("submit", async (e) => {

  e.preventDefault();

  resendBtn.disabled = true;
  resendBtn.style.opacity = "0.6";

  try {

    const response = await fetch("/auth/resend-otp", {

      method: "POST",

      headers: {
        Accept: "application/json"
      }

    });

    const result = await response.json();

    if (result.success) {

      if (successBox) {
        successBox.innerText = result.message;
        successBox.style.display = "block";
      }

      if (errorBox) {
        errorBox.style.display = "none";
      }

      // Restart timer
      seconds = 60;
      timer.textContent = seconds;

      resendBtn.disabled = true;
      resendBtn.style.opacity = "0.6";

      clearInterval(interval);

      interval = setInterval(() => {

        seconds--;

        timer.textContent = seconds;

        if (seconds <= 0) {

          clearInterval(interval);

          resendBtn.disabled = false;
          resendBtn.style.opacity = "1";

        }

      }, 1000);

    } else {

      if (errorBox) {
        errorBox.innerText = result.message;
        errorBox.style.display = "block";
      }

    }

  } catch (error) {

    console.error(error);

  }

});