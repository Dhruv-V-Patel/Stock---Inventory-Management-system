const getForgotPasswordTemplate = ({
 code
}) => {

   const html = `
   <!DOCTYPE html>
   <html>
   <head>
   <meta charset="utf-8">
   <meta name="viewport" content="width=device-width, initial-scale=1.0">
   </head>
   
   <body style="
     margin:0;
     padding:0;
     background:#f4f7fb;
     font-family:Segoe UI,Arial,sans-serif;
   ">
   
     <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
       <tr>
         <td align="center">
   
           <table width="600" cellpadding="0" cellspacing="0" style="
             background:#ffffff;
             border-radius:16px;
             overflow:hidden;
             box-shadow:0 10px 30px rgba(0,0,0,0.08);
           ">
   
             <!-- Header -->
             <tr>
               <td style="
                 background:linear-gradient(135deg,#2563eb,#1d4ed8);
                 padding:40px;
                 text-align:center;
               ">
                 <h1 style="
                   margin:0;
                   color:#ffffff;
                   font-size:28px;
                   font-weight:700;
                 ">
                  Someshwar AI ERP Stock Management System
                 </h1>
   
                 <p style="
                   color:rgba(255,255,255,.85);
                   margin-top:10px;
                   font-size:14px;
                 ">
                   Secure Password Recovery
                 </p>
               </td>
             </tr>
   
             <!-- Body -->
             <tr>
               <td style="padding:40px;">
   
                 <h2 style="
                   margin:0 0 15px;
                   color:#111827;
                   font-size:24px;
                 ">
                   Reset Your Password / Pin
                 </h2>
   
                 <p style="
                   color:#6b7280;
                   line-height:1.7;
                   margin-bottom:30px;
                 ">
                   We received a request to reset your Password or Pin.
                   Use the verification code below to continue.
                 </p>
   
                 <div style="
                   background:#f8fafc;
                   border:2px dashed #2563eb;
                   border-radius:12px;
                   text-align:center;
                   padding:25px;
                   margin:30px 0;
                 ">
                   <div style="
                     font-size:36px;
                     font-weight:700;
                     letter-spacing:10px;
                     color:#2563eb;
                   ">
                     ${code}
                   </div>
                 </div>
   
                 <p style="
                   color:#6b7280;
                   margin-top:25px;
                   line-height:1.7;
                 ">
                   This verification code will expire in
                   <strong>5 minutes</strong>.
                 </p>
   
                 <div style="
                   background:#fef3c7;
                   border-left:4px solid #f59e0b;
                   padding:15px;
                   border-radius:8px;
                   margin-top:25px;
                 ">
                   <strong>Security Notice</strong><br>
                   If you did not request a password reset,
                   you can safely ignore this email.
                 </div>
   
               </td>
             </tr>
   
             <!-- Footer -->
             <tr>
               <td style="
                 padding:25px;
                 text-align:center;
                 border-top:1px solid #e5e7eb;
                 background:#fafafa;
               ">
                 <p style="
                   margin:0;
                   font-size:12px;
                   color:#9ca3af;
                 ">
                   © ${new Date().getFullYear()} Someshwar AI Solution LLP
                 </p>
   
                 <p style="
                   margin-top:8px;
                   font-size:12px;
                   color:#9ca3af;
                 ">
                   This is an automated email. Please do not reply.
                 </p>
               </td>
             </tr>
   
           </table>
   
         </td>
       </tr>
     </table>
   
   </body>
   </html>
   `;

   return {html};
};

module.exports = getForgotPasswordTemplate;