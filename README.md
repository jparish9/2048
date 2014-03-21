# 2048-Autoplay
An extension of [2048](http://gabrielecirulli.github.io/2048/), which is a small clone of [1024](https://play.google.com/store/apps/details?id=com.veewo.a1024), based on [Saming's 2048](http://saming.fr/p/2048/) (also a clone).

Original version by [Gabriele Cirulli](https://github.com/gabrielecirulli/2048).

This version adds an Autoplay mode and a 'hard' tile placement mode.

## Autoplay (AI)

The AI uses minimax, alpha-beta pruning, and iterative deepening with principal variation search.  It is heavily optimized for speed and only functions on a grid size of 4x4.  Most of the speed optimizations come from storing the internal state in just 64 bits (16 cells x 12 possible states [4 bits]), and making heavy use of JavaScript's bitwise operators.

The evaluation of each position looks at the value of the largest tiles (incentivizing combining them), the number of empty tiles, and the "exposure" of each tile.  Exposure is defined as the difference in value of a tile and its adjacent tiles.  A bonus is given, proportional to the tile value, for tiles on the sides or in corners.

I am still tinkering with the evaluation function, but so far it performs pretty well in the default mode (random tile placement) with a reasonably fast machine.

## Hard Mode

For a true challenge (or exercise in frustration), a 'hard' tile placement mode is now available.  In this mode, the new tiles are placed to deliberately combat the player, instead of randomly!

## Contributing
Changes and improvements are more than welcome! Feel free to fork and open a pull request. Please make your changes in a specific branch and request to pull into `master`! If you can, please make sure the game fully works before sending the PR, as that will help speed up the process.

You can find the same information in the [contributing guide.](https://github.com/jparish9/2048-Autoplay/blob/master/CONTRIBUTING.md)

## License
2048 is licensed under the [MIT license.](https://github.com/jparish9/2048-Autoplay/blob/master/LICENSE.txt)

