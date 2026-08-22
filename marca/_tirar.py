#!/usr/bin/env python3
"""Um retrato de uma página local, no tamanho exato. Só isto."""
import asyncio
import sys

from playwright.async_api import async_playwright

CAMINHO, DESTINO, W, H, TRANSP = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), sys.argv[5] == "1"


async def main() -> None:
    async with async_playwright() as p:
        br = await p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
        pg = await br.new_page(viewport={"width": W, "height": H})
        await pg.goto("file://" + CAMINHO)
        await pg.screenshot(path=DESTINO, omit_background=TRANSP)
        await br.close()


asyncio.run(main())
