# Sheet downscale

All eight sheets in `public/assets/banana` and `public/assets/tower` were halved (2x) and palette-quantised. File names are unchanged.

Commands, run per file (`pngquant` and `oxipng` are not installed, so ImageMagick did the 256-colour step):

    magick in.png -filter Lanczos -resize 50% out.png
    magick out.png -dither None -colors 256 -define png:compression-level=9 PNG8:out.png

Sizes in bytes, before then after (dimensions halved: 1254x1254 to 627x627, 1448x1086 to 724x543):

| file | before | after |
| --- | --- | --- |
| banana/detective-walk.png | 1485349 | 120850 |
| banana/jungle-props.png | 1233072 | 105582 |
| banana/monkey-idle.png | 1346962 | 103345 |
| banana/monkeys.png | 1348479 | 104218 |
| tower/apprentice-idle.png | 1277464 | 87860 |
| tower/apprentices.png | 1086128 | 80963 |
| tower/inspector-walk.png | 1397388 | 99827 |
| tower/tower-props.png | 634597 | 53806 |

The grove tables in `client/monkey-idle.ts`, `client/detective-walk.ts` and the `jungle.add` rects in `client/station.ts` are source-pixel numbers and were multiplied by 0.5 (scale doubled).
