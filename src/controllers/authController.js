const bcrypt = require("bcryptjs");
const pool = require("../config/db");
const jwt = require("jsonwebtoken");

const { sendForgotPasswordEmail } = require("../services/emailService");

/* ==========================================
   Generate 6 Digit OTP
========================================== */

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/* ==========================================
   Forgot Password
========================================== */

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required.",
      });
    }

    const result = await pool.query(
      `
      SELECT
          id,
          email,
          name
      FROM users
      WHERE LOWER(email)=LOWER($1)
      LIMIT 1
      `,
      [email],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No account found with this email.",
      });
    }

    const user = result.rows[0];

    const code = generateOTP();

    const expiry = new Date(Date.now() + 5 * 60 * 1000);

    await pool.query(
      `
      UPDATE users
      SET
          reset_code=$1,
          reset_code_expiry=$2
      WHERE id=$3
      `,
      [code, expiry, user.id],
    );

    await sendForgotPasswordEmail({
      email: user.email,
      code,
    });

    return res.json({
      success: true,
      message: "Verification code sent successfully.",
    });
  } catch (error) {
    // console.error("Forgot Password Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to send verification code.",
    });
  }
};

/* ==========================================
   VERIFY RESET CODE
========================================== */

const verifyResetCode = async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({
        success: false,
        message: "Email and verification code are required.",
      });
    }

    const result = await pool.query(
      `
      SELECT
          id,
          reset_code,
          reset_code_expiry
      FROM users
      WHERE LOWER(email)=LOWER($1)
      LIMIT 1
      `,
      [email],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const user = result.rows[0];

    if (!user.reset_code) {
      return res.status(400).json({
        success: false,
        message: "No verification code found. Please request a new code.",
      });
    }

    if (user.reset_code !== code) {
      return res.status(400).json({
        success: false,
        message: "Invalid verification code.",
      });
    }

    if (
      !user.reset_code_expiry ||
      new Date(user.reset_code_expiry) < new Date()
    ) {
      return res.status(400).json({
        success: false,
        message: "Verification code has expired. Please request a new one.",
      });
    }

    return res.json({
      success: true,
      message: "Verification successful.",
    });
  } catch (error) {
    // console.error("Verify Reset Code Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to verify code.",
    });
  }
};

/* ==========================================
   RESET PASSWORD
========================================== */

const resetPassword = async (req, res) => {
  try {
    const { email, code, password } = req.body;

    if (!email || !code || !password) {
      return res.status(400).json({
        success: false,
        message: "Email, verification code and password are required.",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters.",
      });
    }

    const result = await pool.query(
      `
      SELECT
          id,
          reset_code,
          reset_code_expiry
      FROM users
      WHERE LOWER(email)=LOWER($1)
      LIMIT 1
      `,
      [email],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const user = result.rows[0];

    if (!user.reset_code) {
      return res.status(400).json({
        success: false,
        message: "No verification code found. Please request a new code.",
      });
    }

    if (user.reset_code !== code) {
      return res.status(400).json({
        success: false,
        message: "Invalid verification code.",
      });
    }

    if (
      !user.reset_code_expiry ||
      new Date(user.reset_code_expiry) < new Date()
    ) {
      return res.status(400).json({
        success: false,
        message: "Verification code has expired.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await pool.query(
      `
      UPDATE users
      SET
          password_hash = $1,
          reset_code = NULL,
          reset_code_expiry = NULL
      WHERE id = $2
      `,
      [passwordHash, user.id],
    );

    return res.json({
      success: true,
      message: "Password has been reset successfully.",
    });
  } catch (error) {
    // console.error("Reset Password Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to reset password.",
    });
  }
};


module.exports = {
  forgotPassword,
  verifyResetCode,
  resetPassword
};
