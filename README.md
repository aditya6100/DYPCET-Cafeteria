# 🍽️ DYPCET Cafeteria Management System
**Official Handover Documentation**

This project is a full-stack web application designed for the DYPCET Institute Canteen. It allows students and staff to browse the menu, place orders, and manage cafeteria operations digitally.

---

### 🛠️ Technical Stack & Dependencies
The system is built using the **PERN-like stack** (MySQL instead of PostgreSQL):

#### **Backend (Server-side)**
*   **Environment:** Node.js (v16.x or higher)
*   **Framework:** Express.js
*   **Database:** MySQL (v8.0+)
*   **Key Dependencies:**
    *   `mysql2`: Database driver for MySQL.
    *   `bcrypt`: Secure password hashing for user accounts.
    *   `jsonwebtoken` (JWT): Token-based authentication for secure sessions.
    *   `nodemailer`: SMTP integration for the "Forgot Password" email system.
    *   `cors`: Cross-Origin Resource Sharing for frontend communication.
    *   `dotenv`: Management of environment variables (Secrets/Configs).

#### **Frontend (Client-side)**
*   **Library:** React.js (v18+)
*   **Styling:** Custom CSS (Modern, Responsive Design)
*   **Key Dependencies:**
    *   `react-router-dom`: Client-side routing.
    *   `axios`: Promise-based HTTP client for API calls.

---

### 📂 Project Structure
*   `/root`: Backend server, API routes, and database configuration.
*   `/frontend`: React application source code and assets.
*   `dypcet_cafeteria.sql`: Database schema and initial data.
*   `.env.example`: Template for environment configuration.

---

### 🚀 Setup & Installation Instructions

#### **1. Database Setup**
1.  Create a new MySQL database named `dypcet_cafeteria`.
2.  Import the provided `dypcet_cafeteria.sql` file to generate the tables and initial menu.

#### **2. Backend Configuration**
1.  Navigate to the root directory.
2.  Install dependencies: `npm install`
3.  Create a `.env` file (refer to `.env.example`) and fill in:
    *   `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
    *   `JWT_SECRET` (A long random string)
    *   `SMTP_USER` & `SMTP_PASS` (For email functionality)

#### **3. Frontend Configuration**
1.  Navigate to the `/frontend` directory.
2.  Install dependencies: `npm install`
3.  Run `npm start` to view the application locally.

#### **4. Running the Application**
1.  **Start Server:** In the root directory, run `node server.js`.
2.  **Start Frontend:** In the `/frontend` directory, run `npm start`.
3.  Access the app at `http://localhost:3000`.

---

### 🔗 Website Integration
To integrate with the college website (`https://coek.dypgroup.edu.in/`), it is recommended to:
1.  Host the application on a subdomain (e.g., `canteen.coek.dypgroup.edu.in`).
2.  Add a direct link/button on the official Facilities page to the hosted URL.
