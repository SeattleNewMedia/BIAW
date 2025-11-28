# Class Registration System – Human-Friendly Guide

Welcome to your all-in-one solution for managing class registrations, payments, and communications! This system is designed to make it easy for organizations to offer both in-person and online classes, handle payments, manage waitlists, and keep everyone informed—all in one place.

---

## 🌟 What Does This System Do?

- **List and manage classes** (in-person or online)
- **Register participants** (including group registrations)
- **Collect payments securely** with Stripe
- **Automatically calculate and collect sales tax**
- **Manage waitlists** and notify users when seats open up
- **Send professional email notifications** for confirmations, reminders, and more
- **Sync class and registration data** with your website (Webflow)
- **Keep all records organized** in Airtable

---

## 🏗️ How Is It Built?

This system uses a popular software design called **MVC (Model-View-Controller)**. That just means:
- **Models** handle the data (like classes, payments, and members)
- **Controllers** handle requests (like when someone registers for a class)
- **Services** do the heavy lifting (like talking to Stripe, Webflow, or sending emails)
- **Routes** define the different actions you can take (like registering, paying, or joining a waitlist)

---

## 🚀 Main Features

- **Easy Class Registration:** Sign up for paid or free classes, register yourself or a group.
- **Secure Payments:** Pay online with Stripe, with automatic tax calculation based on where the class is or where you live.
- **Waitlist Management:** If a class is full, join the waitlist and get notified when a spot opens.
- **Automated Emails:** Get confirmation emails, reminders, and updates—sent automatically and professionally branded.
- **Real-Time Updates:** Class and seat info is always up-to-date on your website.
- **Admin Tools:** Admins can manage classes, payments, and waitlists easily.

---

## 🛣️ How Does Registration Work?

1. **Browse Classes:** Users see a list of available classes (in-person or online).
2. **Register:** Fill out a form with your info (and your group’s info, if needed).
3. **Backend Magic:**
   - The system checks your info and finds the class in Airtable.
   - It creates records for each participant and a payment record.
4. **Payment:**
   - The system creates a Stripe Checkout session.
   - For in-person classes, tax is based on the class location; for online, it’s based on your address.
   - You’re redirected to Stripe to pay securely.
5. **After Payment:**
   - The system updates records, sends confirmation emails, and updates your website.
   - If you joined a waitlist, you’ll get notified when a seat is available.

---

## 🧩 What’s Under the Hood?

- **Airtable:** Stores all your class, participant, and payment info.
- **Stripe:** Handles payments and tax.
- **Webflow:** Keeps your website in sync with your classes and registrations.
- **Nodemailer:** Sends all emails (using Gmail).
- **Node.js & Express:** The engine that runs everything.

---

## 📝 How to Set Up

1. **Clone the Project:**
   ```bash
   git clone <repository-url>
   cd class-module
   ```
2. **Install Dependencies:**
   ```bash
   npm install
   ```
3. **Configure Environment:**
   - Create a `.env` file with your Airtable, Stripe, Webflow, and email credentials (see the example in the technical README).
4. **Start the App:**
   ```bash
   npm start
   # or for development
   npm run dev
   ```

---

## 🛡️ Security & Reliability

- All sensitive info is stored in environment variables.
- Payments are handled securely by Stripe.
- Webhooks are verified for authenticity.
- Errors are logged and handled gracefully.

---

## 🧑‍💻 For Developers

- **MVC Structure:** Easy to maintain and extend.
- **Automated Workflows:** Webhooks keep everything in sync in real time.
- **Comprehensive Error Handling:** Problems are caught and logged.
- **Professional Email Templates:** All emails are branded and mobile-friendly.

---

## 💡 Tips

- Make sure your Stripe Tax settings are configured (origin address and registrations).
- Use the health check endpoint (`/health`) to monitor if the app is running.
- All class, payment, and waitlist actions are tracked in Airtable for easy admin access.

---

## 📚 Need Help?

- Check the code comments for guidance.
- Contact your project admin for support.

---

**This system is designed to make class management easy, reliable, and professional—so you can focus on delivering great classes!** 