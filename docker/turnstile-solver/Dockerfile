# ============================================
# Turnstile CAPTCHA Solver - Dockerfile
# Uses Camoufox for anti-detection browser
# ============================================

FROM python:3.11-slim

# Install system dependencies for browsers
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    xdg-utils \
    libu2f-udev \
    libvulkan1 \
    libxkbcommon0 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright browsers (for patchright)
RUN python -m patchright install chromium

# Install Camoufox browser (uses camoufox fetch command)
RUN python -m camoufox fetch

# Copy application
COPY api_solver.py .

# Create non-root user
RUN useradd -m -u 1001 solver && chown -R solver:solver /app
USER solver

EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:5000/ || exit 1

# Start the solver
CMD ["python", "api_solver.py", "--headless", "True", "--browser_type", "camoufox", "--thread", "2", "--host", "0.0.0.0", "--port", "5000"]
