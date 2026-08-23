const nodemailer = require("nodemailer");

const getForgotPasswordTemplate = require("../email/forgotPasswordTemplate");

const transporter = nodemailer.createTransport({
  host: "smtpout.secureserver.net",
  port: 465,
  secure: true,
  auth: {
    user: process.env.COMPANY_EMAIL,
    pass: process.env.COMPANY_PASS,
  },
});

const sendForgotPasswordEmail = async ({ email, code }) => {
  const { html } = getForgotPasswordTemplate({
    code,
  });

  await transporter.sendMail({
    from: `"Jay Products" <${process.env.COMPANY_EMAIL}>`,

    to: email,

    subject: "Password Reset Verification Code",

    html,
  });
};

module.exports = {
  sendForgotPasswordEmail,
};
