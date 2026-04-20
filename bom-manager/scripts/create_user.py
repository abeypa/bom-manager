#!/usr/bin/env python3
"""
BOM Manager - User Management Script (Python Version)
This script helps administrators create users via Supabase Management API.
"""

import os
import sys
import json
import secrets
import string
import argparse
import requests
from typing import Optional, Dict, Any

# Configuration
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://your-project.supabase.co")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

# Colors for terminal output
class Colors:
    RED = '\033[0;31m'
    GREEN = '\033[0;32m'
    YELLOW = '\033[1;33m'
    BLUE = '\033[0;34m'
    MAGENTA = '\033[0;35m'
    CYAN = '\033[0;36m'
    WHITE = '\033[0;37m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'
    RESET = '\033[0m'

def print_color(color: str, message: str) -> None:
    """Print colored message to terminal."""
    print(f"{color}{message}{Colors.RESET}")

def print_error(message: str) -> None:
    """Print error message."""
    print_color(Colors.RED, f"ERROR: {message}")

def print_success(message: str) -> None:
    """Print success message."""
    print_color(Colors.GREEN, f"SUCCESS: {message}")

def print_info(message: str) -> None:
    """Print info message."""
    print_color(Colors.YELLOW, f"INFO: {message}")

def print_debug(message: str) -> None:
    """Print debug message (only if DEBUG env var is set)."""
    if os.environ.get("DEBUG"):
        print_color(Colors.CYAN, f"DEBUG: {message}")

def validate_email(email: str) -> bool:
    """Validate email format."""
    import re
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    if not re.match(pattern, email):
        print_error(f"Invalid email format: {email}")
        return False
    return True

def validate_password(password: str) -> bool:
    """Validate password meets minimum requirements."""
    if len(password) < 8:
        print_error("Password must be at least 8 characters")
        return False
    
    # Check for at least one uppercase, one lowercase, one digit
    has_upper = any(c.isupper() for c in password)
    has_lower = any(c.islower() for c in password)
    has_digit = any(c.isdigit() for c in password)
    
    if not (has_upper and has_lower and has_digit):
        print_error("Password must contain uppercase, lowercase, and numbers")
        return False
    
    return True

def generate_password(length: int = 16) -> str:
    """Generate a secure random password."""
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    while True:
        password = ''.join(secrets.choice(alphabet) for _ in range(length))
        if (any(c.islower() for c in password) and
            any(c.isupper() for c in password) and
            any(c.isdigit() for c in password) and
            sum(c in "!@#$%^&*" for c in password) >= 1):
            break
    return password

def make_supabase_request(method: str, endpoint: str, data: Optional[Dict] = None) -> Dict[str, Any]:
    """Make authenticated request to Supabase API."""
    url = f"{SUPABASE_URL}{endpoint}"
    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json"
    }
    
    print_debug(f"Making {method} request to {url}")
    
    try:
        if method.upper() == "GET":
            response = requests.get(url, headers=headers)
        elif method.upper() == "POST":
            response = requests.post(url, headers=headers, json=data)
        elif method.upper() == "PUT":
            response = requests.put(url, headers=headers, json=data)
        elif method.upper() == "DELETE":
            response = requests.delete(url, headers=headers)
        else:
            raise ValueError(f"Unsupported HTTP method: {method}")
        
        response.raise_for_status()
        
        # DELETE requests may not return JSON
        if response.status_code == 204:
            return {}
        
        return response.json()
        
    except requests.exceptions.RequestException as e:
        print_error(f"API request failed: {e}")
        if hasattr(e, 'response') and e.response is not None:
            print_debug(f"Response: {e.response.text}")
        raise

def create_user(email: str, password: str, role: str = "engineer") -> bool:
    """Create a new user in Supabase Auth."""
    print_info(f"Creating user: {email}")
    
    try:
        data = {
            "email": email,
            "password": password,
            "email_confirm": True,
            "user_metadata": {
                "role": role
            }
        }
        
        result = make_supabase_request("POST", "/auth/v1/admin/users", data)
        
        user_id = result.get("id")
        if user_id:
            print_success("User created successfully!")
            print(f"User ID: {user_id}")
            print(f"Email: {email}")
            print(f"Temporary password: {password}")
            print("\nIMPORTANT: User must change password on first login")
            return True
        else:
            print_error("Failed to create user: No user ID in response")
            return False
            
    except Exception as e:
        print_error(f"Failed to create user: {e}")
        return False

def list_users() -> bool:
    """List all users in Supabase Auth."""
    print_info("Fetching user list...")
    
    try:
        result = make_supabase_request("GET", "/auth/v1/admin/users")
        
        users = result.get("users", [])
        if not users:
            print_info("No users found")
            return True
        
        print(f"\nFound {len(users)} user(s):")
        print("-" * 80)
        for user in users:
            user_id = user.get("id", "N/A")
            user_email = user.get("email", "N/A")
            created_at = user.get("created_at", "N/A")
            last_sign_in = user.get("last_sign_in_at", "Never")
            
            # Truncate IDs for readability
            user_id_short = user_id[:8] + "..." if len(user_id) > 8 else user_id
            
            print(f"Email: {user_email}")
            print(f"ID: {user_id_short}")
            print(f"Created: {created_at}")
            print(f"Last Sign In: {last_sign_in}")
            print(f"Confirmed: {user.get('email_confirmed_at', 'Not confirmed')}")
            print("-" * 80)
        
        return True
        
    except Exception as e:
        print_error(f"Failed to list users: {e}")
        return False

def reset_password(email: str) -> bool:
    """Reset password for a user."""
    print_info(f"Resetting password for: {email}")
    
    try:
        # First, find the user by email
        result = make_supabase_request("GET", f"/auth/v1/admin/users?email={email}")
        
        users = result.get("users", [])
        if not users:
            print_error(f"User not found: {email}")
            return False
        
        user_id = users[0].get("id")
        if not user_id:
            print_error("No user ID found in response")
            return False
        
        # Generate new password
        new_password = generate_password()
        
        # Update user password
        data = {"password": new_password}
        make_supabase_request("PUT", f"/auth/v1/admin/users/{user_id}", data)
        
        print_success("Password reset successfully!")
        print(f"New temporary password: {new_password}")
        print("User must change password on next login")
        return True
        
    except Exception as e:
        print_error(f"Failed to reset password: {e}")
        return False

def delete_user(email: str) -> bool:
    """Delete a user (admin only)."""
    print_info(f"Deleting user: {email}")
    
    try:
        # First, find the user by email
        result = make_supabase_request("GET", f"/auth/v1/admin/users?email={email}")
        
        users = result.get("users", [])
        if not users:
            print_error(f"User not found: {email}")
            return False
        
        user_id = users[0].get("id")
        if not user_id:
            print_error(
