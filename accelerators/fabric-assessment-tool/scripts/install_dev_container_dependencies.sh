apt-get update && apt-get install -y \
    cmake \
    libcairo2-dev \
    pkg-config \
    python3-dev \
    libltdl7 \

pip3 install --user -r requirements.txt

curl https://install.duckdb.org | sh