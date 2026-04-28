# Umpire Coder — Update Instructions

There was a bug that prevented clips from being cut automatically at the end of a match. This has now been fixed. Follow the steps below for your operating system — the whole thing takes about a minute.

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
   You should see a line mentioning `native-host/package.json` in the output — this confirms the fix has downloaded.

4. Open **Google Chrome**, go to `chrome://extensions`, find **Umpire Coder**, and click the **circular reload arrow (↺)**

That is it. Clips will now be generated automatically when you end a match.

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
   You should see a line mentioning `native-host/package.json` in the output — this confirms the fix has downloaded.

4. Open **Google Chrome**, go to `chrome://extensions`, find **Umpire Coder**, and click the **circular reload arrow (↺)**

That is it. Clips will now be generated automatically when you end a match.

---

*You do not need to re-run the setup script. Everything else you set up previously is still in place.*
