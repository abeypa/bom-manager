# API Reference

## Overview

This document describes the public REST API endpoints exposed by the BOM Manager application.

---

## GET /api/parts/:category

Retrieve a list of parts for a given category.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| category | string | Yes | Category identifier (e.g., `electronics`) |

**Response:**
- `200 OK` – Array of part objects.
- `400 Bad Request` – Invalid category.

---

## POST /api/parts/:category

Create a new part in the specified category.

**Body:**
```json
{
  "part_number": "string",
  "description": "string",
  "base_price": number,
  "stock_quantity": number
}
```

**Response:**
- `201 Created` – Created part object.
- `400 Bad Request` – Validation error.

---

## GET /api/price-history/:category/:partId

Fetch price history entries for a part.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| category | string | Yes | Category name |
| partId | string | Yes | Part UUID |

**Response:**
- `200 OK` – Array of price history records.
- `404 Not Found` – Part not found.

---

*Add additional endpoints as needed following the same template.*
