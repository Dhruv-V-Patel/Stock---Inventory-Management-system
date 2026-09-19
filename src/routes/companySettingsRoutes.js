const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const router = express.Router();

const {
  getCompanySettings,
  saveCompanySettings,
} = require("../controllers/companySettingsController");

const { authenticateToken } = require("../middleware/authenticateToken");

/* =========================================================
   UPLOAD DIRECTORY
========================================================= */

const uploadDir = path.join(
  process.cwd(),
  "public",
  "images",
  "company-profile",
);

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, {
    recursive: true,
  });
}

/* =========================================================
   MULTER STORAGE
========================================================= */

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },

  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();

    const prefix = file.fieldname === "logo" ? "company-logo" : "company-stamp";

    cb(null, `${prefix}-${Date.now()}${ext}`);
  },
});

/* =========================================================
   IMAGE FILTER
========================================================= */

const fileFilter = (req, file, cb) => {
  // IMPORTANT: MIME type is image/png, image/jpeg, etc.
  // NOT images/png.
  if (!file.mimetype.startsWith("image/")) {
    return cb(new Error("Only image files are allowed."));
  }

  cb(null, true);
};

const upload = multer({
  storage,

  limits: {
    fileSize: 5 * 1024 * 1024,
  },

  fileFilter,
});

router.use(authenticateToken);

router.get("/", getCompanySettings);

router.put(
  "/",
  upload.fields([
    {
      name: "logo",
      maxCount: 1,
    },
    {
      name: "stamp",
      maxCount: 1,
    },
  ]),
  saveCompanySettings,
);

module.exports = router;
