#!/bin/bash

# Download fastText language identification model
# Model: lid.176.bin (compressed version)

MODEL_DIR="./models"
MODEL_FILE="lid.176.bin"
MODEL_URL="https://dl.fbaipublicfiles.com/fasttext/supervised-models/lid.176.bin"

# Create models directory if it doesn't exist
mkdir -p "$MODEL_DIR"

# Check if model already exists
if [ -f "$MODEL_DIR/$MODEL_FILE" ]; then
    echo "Model already exists at $MODEL_DIR/$MODEL_FILE"
    exit 0
fi

echo "Downloading fastText language identification model..."
echo "URL: $MODEL_URL"
echo "Destination: $MODEL_DIR/$MODEL_FILE"

# Download the model
curl -L -o "$MODEL_DIR/$MODEL_FILE" "$MODEL_URL"

if [ $? -eq 0 ]; then
    echo "Model downloaded successfully!"
    echo "File size: $(du -h "$MODEL_DIR/$MODEL_FILE" | cut -f1)"
else
    echo "Failed to download model"
    exit 1
fi
