# Use the official k6 image as the base
FROM grafana/k6:latest

# Set the working directory inside the container
WORKDIR /app

# Copy the k6 test script from your host machine to the container
COPY ./tests/ .
COPY ./utils/ .

# Define the command to run the test when the container starts
ENTRYPOINT ["k6", "run", "/app/tests/audit-service/audit-login.js"]
