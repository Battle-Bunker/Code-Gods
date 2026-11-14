"""Install the pinned upstream WASI build into a disposable dependency cache."""
import hashlib
import io
import pathlib
import urllib.request
import zipfile
import argparse

ROOT = pathlib.Path(__file__).resolve().parents[3]
CACHE = ROOT / ".cache" / "code-gods" / "python-3.15.0"
URL = "https://github.com/brettcannon/cpython-wasi-build/releases/download/v3.15.0/python-3.15.0-wasi_sdk-33.zip"
SHA256 = "00b791b3729230f97a625087f534d71978433fb1e068e13a9cac8cd3f2541742"


def install(destination=CACHE):
    with urllib.request.urlopen(URL, timeout=60) as response:
        data = response.read(64 * 1024 * 1024 + 1)
    if hashlib.sha256(data).hexdigest() != SHA256:
        raise RuntimeError("WASI dependency checksum mismatch")
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        for member in archive.infolist():
            path = pathlib.PurePosixPath(member.filename)
            if path.is_absolute() or ".." in path.parts:
                raise RuntimeError("Unsafe archive path")
        destination.mkdir(parents=True, exist_ok=True)
        archive.extractall(destination)
    if not (destination / "python.wasm").is_file() or not (destination / "lib").is_dir():
        raise RuntimeError("WASI dependency is missing required runtime assets")
    print("Installed verified CPython 3.15.0 WASI dependency at", destination)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--destination", type=pathlib.Path, default=CACHE)
    install(parser.parse_args().destination)
