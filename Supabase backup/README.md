# 📦 BOM Manager - Supabase Backup Tool

This tool creates a full SQL snapshot of your **BOM Manager** database. It tracks all tables (Projects, Parts, Suppliers, stock history, etc.) directly from Supabase.

---

## 🚀 Step-by-Step Instructions

### 1. Open PowerShell in Admin Mode
*   Press the **Windows Key** on your keyboard.
*   Type **"PowerShell"**.
*   Right-click on **Windows PowerShell** and select **"Run as Administrator"**.

### 2. Navigate to this Folder
Copy and paste the following command into your PowerShell window and press **Enter**:
```powershell
cd "E:\Coding\BOM Software\Supabase backup"
```

### 3. Setup (Only needed the first time)
Ensure the required tools are installed by running:
```powershell
npm install
```

### 4. Run the Backup
Run the final backup command:
```powershell
node backup_full.js
```

---

## 📁 Where is my backup?
Once the script says **"SUCCESS"**, a new file will appear in this folder named like this:
`BOM_MANAGER_BACKUP_2026-04-15_15-12.sql`

This file contains your entire database. **Keep it safe!**

---

## 🛠 Common Troubleshooting

### "Authentication Failed"
Check your **`.env`** file. 
*   Right-click `.env` and open with **Notepad**.
*   Make sure your `DB_PASSWORD` is correct inside the quotes.
*   Example: `DB_PASSWORD="YourPasswordHere"`

### "Node is not recognized"
If you get an error saying 'node' is not found, you need to install it from [nodejs.org](https://nodejs.org/).

### Special Characters in Password
If your password has a `#` or `@`, ensure it is wrapped in double quotes in the `.env` file just like the example above.
