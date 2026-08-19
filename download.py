import urllib.request
import json
import sys

def download_package(package_name):
    print(f"Fetching metadata for {package_name}...")
    url = f"https://pypi.org/pypi/{package_name}/json"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read().decode())
    
    version = data["info"]["version"]
    print(f"Latest version: {version}")
    
    releases = data["releases"][version]
    download_url = None
    for release in releases:
        if release["packagetype"] == "bdist_wheel" and "win_amd64" in release["filename"]:
            download_url = release["url"]
            filename = release["filename"]
            break
            
    if not download_url:
        print("No Windows wheel found.")
        return
        
    print(f"Downloading from: {download_url}")
    urllib.request.urlretrieve(download_url, filename)
    print(f"Downloaded {filename} successfully.")

if __name__ == "__main__":
    download_package("sea-g2p")
