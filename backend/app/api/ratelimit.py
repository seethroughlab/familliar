"""Rate limiting configuration for the API."""

from slowapi import Limiter
from slowapi.util import get_remote_address

# Create limiter using client IP as the key
limiter = Limiter(key_func=get_remote_address)

# Rate limit constants
CHAT_RATE_LIMIT = "10/minute"  # LLM calls are expensive
GENERAL_RATE_LIMIT = "100/minute"  # General API calls
SCAN_RATE_LIMIT = "5/minute"  # Library scanning is heavy
