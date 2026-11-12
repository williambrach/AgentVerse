# Castelvento scene · spec

## 1. Ottavio is a different person
Ottavio (sprite `wizard`) is a recolour of the inventor and shares Matteo's face on the cast cards and in the square. Repaint every `wizard-*.png` frame from the inventor frames so he reads as an elderly man: silver hair, a long silver beard, ivory robe, burgundy mantle. Same frame size (132 x 188), same feet line and head column, so motion and cut registration still hold. Stopgap until art request R2 is delivered.

## 2. Market props
Copy `castelvento-expansion-v1/{market-props.png,inventory-objects.png,atlas.json}` byte for byte into `public/assets/renaissance/expansion/`. Draw selected props from atlas rectangles, bottom anchored, depth sorted by foot y, nearest-neighbour. Activity areas: crates, barrel and handcart on the delivery side; produce basket by the fruit stall; herb planter and ceramic jars by the apothecary door; cloth bolts by the cloth stall; a bench along an architectural edge. Collision follows a small ground footprint, never the image rectangle. Broad connected walking routes; every NPC approach point, the briefing stop and the plaza stay reachable.

## 3. Depth
Figures and props at the back of the square (small y) draw slightly smaller than at the front (linear perspective factor, Castelvento only).

## 4. Characters
Each NPC stands near a relevant activity area, feet on open cobbles, approach point reachable, silhouettes apart. The scout's movement and walk animation are unchanged.

## 5. Compact world labels (department and Castelvento)
Small, consistent name tags. Strong when the detective is near, the pointer hovers the figure, or the figure is in the open conversation; subtle otherwise. Above the head, never over a face; no two tags overlap; never clipped at the world edge. The cast rail stays the accessible identification.

## 6. Stops
No START HERE world tag: a concise objective in the movement hint and a subtle ring under the detective. No YOUR GUESS world stop: the rail's existing accusation button ("Accuse the traveller" / "Make your verdict") is the control, on desktop and compact layouts.

## 7. HUD icons (Castelvento only)
From inventory-objects.png via CSS crops of the untouched sheet: notebook on the Notebook button, seal stamp on the accusation button, coin pouch on the coin counter, town map on the world panel. Names stay as visible text. No new items, no quests.

## 8. Constraints
No change to server/cases or case content; the traveller is never revealed by art, props, labels or icons. Other scenarios unchanged.
