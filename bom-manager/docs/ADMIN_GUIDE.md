# Admin Command Center Guide

The Admin Panel (`/admin`) is a secure dashboard for managing user access and system health.

## 👤 User Management

### 1. Creating Users
Use the **"Add User"** button. 
- You can enter a partial username (e.g., `rishi`) and it will auto-complete to `@bepindia.com`.
- **Note:** Admin-created users can log in immediately. Email confirmation is bypassed.

### 2. Role Management
- **User Role:** Standard access to view/edit parts and projects.
- **Admin Role:** Full system access, including the Admin Panel and financial data in POs.
- *Tip: You cannot revoke your own admin status.*

### 3. Password Resets
Admins can reset any user's password directly from the user table.
- Click the **"Password"** (Key) button.
- Enter a new 6+ character password.
- **Requirement:** Ensure the `admin_reset_user_password` SQL RPC is deployed.

## ⚙️ System Diagnostics

### Profiling Metadata
The admin panel monitors for "Orphaned Profiles" (users with missing email/name metadata). 
- If a user exists in Auth but not in the Profiles table, they will appear with a warning.
- Clicking **"Sync Data"** refreshes the system state.

### System Statistics
Includes real-time counts for:
- Registered Users
- Active Projects
- Total Unique Parts in Registry
