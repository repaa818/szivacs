# Szivacs

A Szivacs egy asztali alkalmazas az e-Kreta rendszerhez. Az e-Kreta webes feluletenek funkcioit (orarend, jegyek, hianyzasok, dolgozatok, taska pakolas) teszi elerhetove egy gyors, letisztult asztali kliensben.

## Letoltes

- **Windows:** `Szivacsok/szivacs_windows/dist/Szivacs Setup 1.0.0.exe`
- **Linux (AppImage):** `Szivacsok/szivacs_linux/dist/Szivacs-1.0.0.AppImage`
- **Linux (.deb):** `Szivacsok/szivacs_linux/dist/szivacs_1.0.0_amd64.deb`

## Telepites

**Windows:** Futtasd a telepito `.exe`-t. Telepites utan a Start menubol indithato.

**Linux (AppImage):**
```bash
chmod +x Szivacs-1.0.0.AppImage
./Szivacs-1.0.0.AppImage
```

**Linux (.deb):**
```bash
sudo dpkg -i szivacs_1.0.0_amd64.deb
```

## Hasznalat

1. **Bejelentkezes** — Az alkalmazas elinditasa utan az e-Kreta KretaiD (Google) fiókoddal tudsz bejelentkezni. Egy bongeszofulet nyit meg a hitelesiteshez, majd visszater az alkalmazasba.
2. **Oldalsav** — A bal oldali savval valthatsz a funkciok kozott: orarend, jegyek, hianyzasok, dolgozatok, taska pakolas, statisztikak, beallitasok.
3. **Adatok frissitese** — Minden oldal automatikusan betoltodik az elso megtekintesnel. A cache-elt adatok gyorsitjak a visszaterest.
4. **Temak** — A beallitasokban (fogas kerék ikon a jobb also sarokban) valaszthatsz 6 temakozul: dark, light, midnight, forest, sunset, ocean.
5. **Kijelentkezes** — A beallitasok panelen tudsz kijelentkezni.

## Funkciok

- **Orarend** — A napi orarend attekintese. Szinkodolt targyak, aktualis ora kiemelve.
- **Jegyek** — Osszes jegyeid listaja tantargyankent. Tantargyi atlagok, osztalyatlaghoz hasonlitas, grafikonok.
- **Hianyzasok** — Igazolt, igazolatlan hianyzasok es kesesek reszletes lebontasban, datum szerint szurheto.
- **Dolgozat naptar** — Bejelentett szamonkeresek naptarnezetben. Hatardatok, temakorok.
- **Taska pakolas** — A masnapi orarend alapjan megmondja, milyen konyveket es felszerelest kell bevinned.
- **Statisztikak** — Jegyek eloszlasa, idobeli alakulasa, tantargyi teljesitmeny.

## Jelszavak kezelese

A bejelentkezes utan a Szivacs a `refresh_token`-et elmenti a gepedre, igy nem kell minden inditaskor ujra bejelentkezni. A tokenek a kovetkezo helyen talalhatoak:

- **Linux:** `~/.config/szivacs/szivacs-tokens.json`
- **Windows:** `%APPDATA%/szivacs/szivacs-tokens.json`

Ha torlod ezt a fajlt, kijelentkezteted magad.
