const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const pool = require("../config/db");
const {
  forgotPassword,
  verifyResetCode,
  resetPassword
} = require("../controllers/authController");
const { authenticateToken } = require("../middleware/authenticateToken");

const router = express.Router();

router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Email/mobile number and password are required.",
      });
    }
    const loginIdentifier = username.trim();
    const result = await pool.query(
      `SELECT
            id,
            name,
            email,
            mobile,
            password_hash,
            role,
            is_active
        FROM users
        WHERE LOWER(email)=LOWER($1)
          OR mobile=$1
        LIMIT 1; `,
      [loginIdentifier],
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid email/mobile number or password.",
      });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: "Your account is inactive. Please contact administrator.",
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email/mobile number or password.",
      });
    }

    //token
    const loginToken = jwt.sign(
      {
        userId: user.id,
        role: user.role,
        name: user.name,
        type: "login",
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      },
    );

    return res.status(200).json({
  success: true,
  message: "Login successful.",

  loginToken,

  user: {
    id: user.id,
    name: user.name,
    email: user.email,
    mobile: user.mobile,
    role: user.role,
  },
});
  } catch (error) {
    console.error("Login Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error.",
    });
  }
});


router.post("/forgot-password", forgotPassword);

router.post("/verify-reset-code", verifyResetCode);

router.post("/reset-password", resetPassword);

module.exports = router;
