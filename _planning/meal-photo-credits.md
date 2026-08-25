# Meal photo sources

Photos in `public/meals/` were pulled from Wikimedia Commons (openly licensed,
no API key needed) — one search per dish, first well-matched, high-resolution
result. They're stock photos of the *dish*, not the actual cottage meal, and
some are closer matches than others (`whatevers-left` and `leftovers`
especially are approximations). Swap any of these out by replacing the file
at the same path — no code or database change needed.

| Meal (seed title) | File | Source |
| --- | --- | --- |
| Chili | `chili.jpg` | [Bowl of chili.jpg](https://commons.wikimedia.org/wiki/File:Bowl_of_chili.jpg) |
| Pancakes, Sausage & Fruit | `pancakes-sausage-fruit.jpg` | [Hearty breakfast at Clarion Hotel Helsinki.jpg](https://commons.wikimedia.org/wiki/File:Hearty_breakfast_at_Clarion_Hotel_Helsinki.jpg) |
| Grilled Cheese & Veggie Sticks | `grilled-cheese-veggie-sticks.jpg` | [Brisket and grilled cheese sandwich with a side of French fries.jpg](https://commons.wikimedia.org/wiki/File:Brisket_and_grilled_cheese_sandwich_with_a_side_of_French_fries.jpg) |
| Make-Your-Own Pizza | `make-your-own-pizza.jpg` | [Homemade Pizza in Bangladesh.jpg](https://commons.wikimedia.org/wiki/File:Homemade_Pizza_in_Bangladesh.jpg) |
| Eggs, Toast & Fruit | `eggs-toast-fruit.jpg` | [Streaky bacon, fried egg on toast, Cromer (1).JPG](https://commons.wikimedia.org/wiki/File:-2019-07-30_Streaky_bacon,_fried_egg_on_toast,_Cromer_(1).JPG) |
| Hot Dogs & Raw Veg | `hot-dogs-raw-veg.jpg` | [Hot dog with french fries, Trimingham, Norfolk.JPG](https://commons.wikimedia.org/wiki/File:-2020-06-19_Hot_dog_with_french_fries,_Trimingham,_Norfolk.JPG) |
| Pulled Pork & Burrito Bowls | `pulled-pork-burrito-bowls.jpg` | [B.B.Q. Pulled Pork Sandwich.jpg](https://commons.wikimedia.org/wiki/File:B.B.Q._Pulled_Pork_Sandwich.jpg) |
| Waffles, Bacon & Fruit | `waffles-bacon-fruit.jpg` | [Scrambled eggs, bacon and a waffle… Ramada Rochelle Park.jpg](https://commons.wikimedia.org/wiki/File:2018-07-21_06_21_04_Scrambled_eggs,_bacon_and_a_waffle_served_as_part_of_breakfast_at_the_Ramada_by_Wyndham_Rochelle_Park_Near_Paramus_in_Rochelle_Park_Township,_Bergen_County,_New_Jersey.jpg) |
| Sloppy Joes & Coleslaw | `sloppy-joes-coleslaw.jpg` | [Mmm... sloppy joe with cheese and red ripe jalapeno chilies.jpg](https://commons.wikimedia.org/wiki/File:Mmm..._sloppy_joe_with_cheese_and_red_ripe_jalapeno_chilies_(7735939558).jpg) |
| Chicken Skewers, Greek Salad & Lemon Potatoes | `chicken-skewers-greek-salad-lemon-potatoes.jpg` | [DFC 5235 – charcoal-grilled chicken skewers.jpg](https://commons.wikimedia.org/wiki/File:DFC_5235-_Charcoal-grilled_skewers_of_juicy,_marinated_chicken_sizzling_to_a_perfect_caramelized_finish.jpg) |
| Scrambled Eggs with Yogurt & Granola | `scrambled-eggs-yogurt-granola.jpg` | [Cheesy Scrambled Eggs (16).jpg](https://commons.wikimedia.org/wiki/File:Cheesy_Scrambled_Eggs_(16)_(38219249386).jpg) — CC BY 2.0 |
| Beef Shishkabobs | `beef-shishkabobs.jpg` | [Ground beef kebab.jpg](https://commons.wikimedia.org/wiki/File:Ground_beef_kebab.jpg) |
| Burgers, Fries & Salad | `burgers-fries-salad.jpg` | [Hamburger and French fries at Antell Martintalo.jpg](https://commons.wikimedia.org/wiki/File:Hamburger_and_French_fries_at_Antell_Martintalo_in_December_2025.jpg) |
| Whatever's Left | `whatevers-left.jpg` | [Food Safety – Cut Waste in Refrigerators.jpg](https://commons.wikimedia.org/wiki/File:Food_Safety_-_Cut_Waste_in_Refrigerators_(20200608-FSIS-LSC-0179).jpg) |
| Chicken Salad | `chicken-salad.jpg` | [Chicken salad sandwich.jpg](https://commons.wikimedia.org/wiki/File:Chicken_salad_sandwich.jpg) |
| Garlic Shrimp & Sesame Soba Noodles | `garlic-shrimp-sesame-soba-noodles.jpg` | [DFC 4054 – garlic chili shrimp noodles.jpg](https://commons.wikimedia.org/wiki/File:DFC_4054_Garlic_chili_spaghetti_tossed_with_shrimp_fresh_parsley_and_vibrant_veggies_-_a_simple_savory_seafood_pasta_delight.jpg) |
| Leftovers | `leftovers.jpg` | [Breakfast & lunch meal prep.jpg](https://commons.wikimedia.org/wiki/File:Breakfast_%26_lunch_meal_prep_(45165265155).jpg) |

All resized to a 1600px max edge and re-encoded as JPEG (quality 82) before
being committed — the originals were much larger camera/agency files.
