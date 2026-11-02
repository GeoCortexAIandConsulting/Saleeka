# Silhouette photos

Drop photos into the style's folder and the quiz picks them up automatically: just refresh the page.
No code changes and no special file names needed.

```
web/public/silhouettes/
  women/                      men/
    shirt-trouser/              shalwar-kameez/
    shalwar-kameez/             kurta-trouser/
    a-line/                     waistcoat/
    angrakha/                   western-shirt/
    maxi/                       suit/
    peplum/                     sherwani/
    sharara/                    prince-coat/
    anarkali/                   polo-jeans/
    co-ord/                     pathani/
    fusion/                     kurta-jeans/
```

- Each card shows one photo: the first in the folder, sorted by file name (e.g. `1.jpg`). `.jpg`, `.jpeg`, `.png` and `.webp` work.
- A style with no photo shows a drawing until you add one.
- Portrait photos work best; the top of the photo is kept when cropping.

**Only use photos you have the right to use**: your own, a brand's with written permission, or freely
licensed ones (Wikimedia Commons, Unsplash, Pexels). Not Pinterest or Google Images. Write down each
photo's source below. Free licences like CC BY also require crediting the author on the /credits page
(add an entry to `web/lib/silhouettePhotos.ts`).

## Sources
<!-- women/anarkali/1.jpg | where it came from | author | licence or permission -->
