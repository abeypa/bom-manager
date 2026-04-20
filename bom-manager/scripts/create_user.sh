#!/bin/bash

# BOM Manager - User Creation Script
# This script helps administrators create users via Supabase Management API
# Requires: curl, jq, and SUPABASE_SERVICE_ROLE_KEY environment variable

set -e

# Configuration
SUPABASE_URL="${SUPABASE_URL:-https://your-project.supabase.co}"
SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_error() {
    echo -e "${RED}ERROR: $1${NC}"
}

print_success() {
    echo -e "${GREEN}SUCCESS: $1${NC}"
}

print_info() {
    echo -e "${YELLOW}INFO: $1${NC}"
}

# Function to validate email
validate_email() {
    local email="$1"
    if [[ ! "$email" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
        print_error "Invalid email format: $email"
        return 1
    fi
    return 0
}

# Function to validate password
validate_password() {
    local password="$1"
    if [ ${#password} -lt 8 ]; then
        print_error "Password must be at least 8 characters"
        return 1
    fi
    return 0
}

# Function to create user
create_user() {
    local email="$1"
    local password="$2"
    local role="${3:-engineer}"
    
    print_info "Creating user: $email"
    
    # Create user via Supabase Management API
    response=$(curl -s -X POST "$SUPABASE_URL/auth/v1/admin/users" \
        -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
        -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
        -H "Content-Type: application/json" \
        -d "{
            \"email\": \"$email\",
            \"password\": \"$password\",
            \"email_confirm\": true,
            \"user_metadata\": {
                \"role\": \"$role\"
            }
        }")
    
    # Check for errors
    if echo "$response" | jq -e '.error' > /dev/null 2>&1; then
        error_msg=$(echo "$response" | jq -r '.error.message // .msg // "Unknown error"')
        print_error "Failed to create user: $error_msg"
        return 1
    fi
    
    # Extract user ID from response
    user_id=$(echo "$response" | jq -r '.id')
    
    if [ "$user_id" != "null" ] && [ -n "$user_id" ]; then
        print_success "User created successfully!"
        echo "User ID: $user_id"
        echo "Email: $email"
        echo "Temporary password: $password"
        echo ""
        echo "IMPORTANT: User must change password on first login"
        return 0
    else
        print_error "Failed to parse response"
        return 1
    fi
}

# Function to list users
list_users() {
    print_info "Fetching user list..."
    
    response=$(curl -s -X GET "$SUPABASE_URL/auth/v1/admin/users" \
        -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
        -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")
    
    if echo "$response" | jq -e '.error' > /dev/null 2>&1; then
        error_msg=$(echo "$response" | jq -r '.error.message // .msg // "Unknown error"')
        print_error "Failed to list users: $error_msg"
        return 1
    fi
    
    echo "Current users:"
    echo "$response" | jq -r '.users[] | "\(.email) - \(.id) - Created: \(.created_at)"'
}

# Function to reset user password
reset_password() {
    local email="$1"
    
    print_info "Resetting password for: $email"
    
    # First get user ID
    response=$(curl -s -X GET "$SUPABASE_URL/auth/v1/admin/users?email=$email" \
        -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
        -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")
    
    user_id=$(echo "$response" | jq -r '.users[0].id')
    
    if [ "$user_id" = "null" ] || [ -z "$user_id" ]; then
        print_error "User not found: $email"
        return 1
    fi
    
    # Generate random password
    new_password=$(openssl rand -base64 16 | tr -d '/+' | cut -c1-16)
    
    # Update user password
    response=$(curl -s -X PUT "$SUPABASE_URL/auth/v1/admin/users/$user_id" \
        -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
        -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
        -H "Content-Type: application/json" \
        -d "{
            \"password\": \"$new_password\"
        }")
    
    if echo "$response" | jq -e '.error' > /dev/null 2>&1; then
        error_msg=$(echo "$response" | jq -r '.error.message // .msg // "Unknown error"')
        print_error "Failed to reset password: $error_msg"
        return 1
    fi
    
    print_success "Password reset successfully!"
    echo "New temporary password: $new_password"
    echo "User must change password on next login"
}

# Main script logic
main() {
    # Check dependencies
    if ! command -v curl &> /dev/null; then
        print_error "curl is required but not installed"
        exit 1
    fi
    
    if ! command -v jq &> /dev/null; then
        print_error "jq is required but not installed"
        exit 1
    fi
    
    # Check for service role key
    if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
        print_error "SUPABASE_SERVICE_ROLE_KEY environment variable is not set"
        echo "Get it from: Supabase Dashboard → Settings → API → service_role key"
        exit 1
    fi
    
    # Parse command line arguments
    case "${1:-}" in
        create)
            if [ $# -lt 3 ]; then
                echo "Usage: $0 create <email> <password> [role]"
                exit 1
            fi
            validate_email "$2" || exit 1
            validate_password "$3" || exit 1
            create_user "$2" "$3" "${4:-}"
            ;;
        list)
            list_users
            ;;
        reset)
            if [ $# -lt 2 ]; then
                echo "Usage: $0 reset <email>"
                exit 1
            fi
            validate_email "$2" || exit 1
            reset_password "$2"
            ;;
        interactive)
            echo "Interactive User Creation"
            echo "========================"
            read -p "Enter user email: " email
            validate_email "$email" || exit 1
            
            read -sp "Enter temporary password: " password
            echo
            validate_password "$password" || exit 1
            
            read -p "Enter role [engineer]: " role
            role=${role:-engineer}
            
            create_user "$email" "$password" "$role"
            ;;
        *)
            echo "BOM Manager User Management Script"
            echo "================================="
            echo ""
            echo "Usage:"
            echo "  $0 create <email> <password> [role]  - Create a new user"
            echo "  $0 list                              - List all users"
            echo "  $0 reset <email>                     - Reset user password"
            echo "  $0 interactive                       - Interactive mode"
            echo ""
            echo "Environment Variables:"
            echo "  SUPABASE_URL              - Your Supabase project URL"
            echo "  SUPABASE_SERVICE_ROLE_KEY - Supabase service_role key"
            echo ""
            echo "Example:"
            echo "  export SUPABASE_SERVICE_ROLE_KEY=your_service_key"
            echo "  $0 create user@example.com TempPass123 engineer"
            exit 1
            ;;
    esac
}

# Run main function
main "$@"
