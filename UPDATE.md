# Umpire Coder — Update Instructions

If you have already completed the full setup, follow the steps below to apply the latest fix.
This update enables automatic clip cutting at the end of a match.

---

## Windows

1. Press the **Windows key**, type **PowerShell**, and open **Windows PowerShell**

2. Paste this command and press **Enter**:
   ```
   cd C:\Users\%USERNAME%\Documents\umpireCoding
   ```

3. Paste this command and press **Enter**:
   ```
   git pull
   ```
   You should see `native-host/package.json` in the output — that confirms the fix has downloaded.

4. Open **Google Chrome**, go to `chrome://extensions`, find **Umpire Coder**, and click the **circular reload arrow (↺)**.

---

## Mac

1. Open **Terminal** (press Cmd + Space, type `Terminal`, press Enter)

2. Paste this command and press **Enter**:
   ```
   cd ~/Documents/umpireCoding
   ```

3. Paste this command and press **Enter**:
   ```
   git pull
   ```

4. Paste this command and press **Enter**:
   ```
   cd mac/native-host && ./install.sh
   ```
   The script will ask for your **Extension ID** — go to `chrome://extensions` in Chrome, find Umpire Coder, and copy the ID from underneath it.

5. Open **Google Chrome**, go to `chrome://extensions`, find **Umpire Coder**, and click the **circular reload arrow (↺)**.

---

*After completing these steps, clips will be generated automatically when you end a match.*
