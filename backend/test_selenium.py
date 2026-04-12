from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager

print("מוריד ChromeDriver...")
driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()))
driver.get("https://google.com")
print("Chrome נפתח בהצלחה!")
input("לחץ Enter לסגירה...")
driver.quit()
