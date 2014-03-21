function Player(grid) {
  this.grid = grid;
  this.state = [0,0];

  // search statistics
  this.nodesScanned = 0;
  this.totalNodesScanned = 0;
  this.totalTimeMs = 0;
}

Player.TILE_STATE_MAP = {0: 0, 2: 1, 4: 2, 8: 3, 16: 4, 32: 5, 64: 6, 128: 7, 256: 8, 512: 9, 1024: 10, 2048: 11};     // log2 lookup table.
Player.TILE_VALUES = [0,0,0,1,3,9,27,81,243,729,2187,6561];     // incentivize tile combination.  a combined tile is worth more than its 2 components.

Player.MIN_SEARCH_DEPTH = 5;
Player.MAX_SCORE = 100000;      // flag value for won or lost position.

// move codes
Player.MOVE_TEXT = {0: "&#x25B2;", 2: "&#x25BC;", 1: "&#x25B6;", 3: "&#x25C0;"};

Player.prototype.updateGameState = function() {
  // read game state from this.grid
  this.state = [0, 0];

  var offset = 0;
  for (var i=0; i<4; i++) {
    for (var j=0; j<4; j++) {
      var content = this.grid.cellContent({x: j, y: i});
      if (content != null) {
        this.state[offset>>5] |= (Player.TILE_STATE_MAP[content.value] << (offset & 0x1f));
      }

      offset += 4;
    }
  }
};

// minimax with alpha-beta pruning and iterative deepening as game tree branching degree/host performance allows.
Player.prototype.search = function(isPlayer) {
  this.updateGameState();

/*  console.log("game state for search:");
  this.printState();*/

  this.nodesScanned = 0;
  var elapsed = 0;
  var maxDepth = Player.MIN_SEARCH_DEPTH;
  var move;
  var pv = [];
  this.failHighCount = 0;
  do {
    var startTime = new Date();
    move = this.minimax(isPlayer, this.state, 1, maxDepth, -Player.MAX_SCORE-100, Player.MAX_SCORE+100, pv);
    if (move.move == undefined) {
      //console.log("END OF GAME");
      return move;
    }
    elapsed = new Date() - startTime;
    this.totalNodesScanned += this.nodesScanned;
    this.totalTimeMs += elapsed;

    if (isPlayer) {
      $("#ai-stats").html("Best move: " + this.readableMove(move) + "<br/>Depth " + maxDepth + ", " + this.nodesScanned + " positions in " + ((new Date() - startTime)/1000) + " sec<br/><br/>Performance: " + Math.floor(1000*(this.totalNodesScanned / this.totalTimeMs)) + " positions/sec");
    }

    //console.log("best move " + this.readableMove(move) + ", score " + move.score + ", " + this.nodesScanned + " nodes (depth " + maxDepth + ", done in " + (new Date() - startTime) + " ms, cumulative performance " + Math.floor(1000*(this.totalNodesScanned / this.totalTimeMs)) + " nodes/s, fail high count: " + this.failHighCount);

    maxDepth++;
  }
  while ((this.nodesScanned < 100000 || this.totalTimeMs < 50) && (move.score < Player.MAX_SCORE-20 && move.score > -Player.MAX_SCORE+20));    // iterative deepening if terminal position not found and search time remaining.

  return move;
};

Player.prototype.minimax = function(isPlayer, state, depth, maxDepth, alpha, beta, pv) {
  var localpv = [];
  this.nodesScanned++;
  var score = this.evalPosition(state);
  if (score == Player.MAX_SCORE) return {score: score-depth};     // win!

  var bestMove = {};

  var playerMoves = [];
  if (canMoveUp(state)) playerMoves.push(0);
  if (canMoveRight(state)) playerMoves.push(1);
  if (canMoveDown(state)) playerMoves.push(2);
  if (canMoveLeft(state)) playerMoves.push(3);

  if (playerMoves.length == 0) return {score: -Player.MAX_SCORE + depth};      // lose!

  if (depth > maxDepth) {     // leaf node
    pv = [];
    return {score: score};
  }

  var move;

  if (isPlayer) {
    // if we have a PV and appear to be in it, search the PV move first as it is the most likely to be best.
    if (pv.length > depth-1) {
      var idx = playerMoves.indexOf(pv[depth-1].move.move);
      if (idx > 0) {      // found and not already at front of move list.
        playerMoves.splice(idx, 1);
        playerMoves.unshift(pv[depth-1].move.move);
      }
    }

    for (var i=0; i<playerMoves.length; i++) {
      if (i == 0) {   // PV search
        move = this.minimax(!isPlayer, makeMove(playerMoves[i], [state[0], state[1]]), depth+1, maxDepth, beta-1, beta, localpv);
        if (move.score > alpha && move.score < beta) {      // fail high, re-search with full window
          this.failHighCount++;
          move = this.minimax(!isPlayer, makeMove(playerMoves[i], [state[0], state[1]]), depth+1, maxDepth, alpha, move.score, localpv);
        }
      }
      else {
        move = this.minimax(!isPlayer, makeMove(playerMoves[i], [state[0], state[1]]), depth+1, maxDepth, alpha, beta, localpv);
      }

      if (move.score > alpha) {
        bestMove = {move: playerMoves[i], score: move.score};
        alpha = move.score;
        // update the PV with this new best move.
        pv[0] = bestMove;
        for (var n=0; n<localpv.length; n++) {
          pv[n+1] = localpv[n];
        }
        if (alpha >= beta) return {score: beta};    // cutoff
      }
    }

    if (bestMove.move != undefined) {
      return {move: bestMove.move, score: alpha};
    }
    else {
      return {score: alpha};
    }
  }
  else {        // CPU (tile-placer)
    // pv search is far more cumbersome here.
    for (var j=0; j<2; j++) {
      for (var k=0; k<32; k+=4) {
        var val = (state[j] >> k) & 0xf;
        if (val == 0) {
          // empty space = possible computer move.
          for (var newTile=1; newTile<=2; newTile++) {
            var newState = [state[0], state[1]];
            newState[j] |= (newTile << k);        // insert 2 or 4 at this location.
            move = this.minimax(!isPlayer, newState, depth+1, maxDepth, alpha, beta, localpv);
            if (move.score < beta) {
              bestMove = {move: {position: {x: ((j<<5)+k)>>4, y: (((j<<5)+k)>>2) & 0x3}, value: 2*newTile}, score: move.score};
              beta = move.score;
              // update the PV with this new best move.
              pv[0] = bestMove;
              for (var m=0; m<localpv.length; m++) {
                pv[m+1] = localpv[m];
              }
              if (beta <= alpha) return {score: alpha};
            }
          }
        }
      }
    }

    if (bestMove.move != undefined) {
      return {move: bestMove.move, score: beta};
    }
    else {
      return {score: beta};
    }
  }
};

// print readable 2d array of current state
Player.prototype.printState = function() {
  for (var i=0; i<2; i++) {
    console.log(((this.state[i] >> 0) & 0xf) + " " + ((this.state[i] >> 4) & 0xf) + " " + ((this.state[i] >> 8) & 0xf) + " " + ((this.state[i] >> 12) & 0xf));
    console.log(((this.state[i] >> 16) & 0xf) + " " + ((this.state[i] >> 20) & 0xf) + " " + ((this.state[i] >> 24) & 0xf) + " " + ((this.state[i] >> 28) & 0xf));
  }
};

function makeMove(which, state) {
  if (which == 0) return moveUp(state);
  if (which == 1) return moveRight(state);
  if (which == 2) return moveDown(state);

  return moveLeft(state);
}

function canMoveDown(state) {
  for (var j=0; j<16; j+=4) {
    // empty space below filled space
    if (((state[1] >> j+16) & 0xf) == 0 && (((state[1] >> j) & 0xf) != 0 || ((state[0] >> j+16) & 0xf) != 0 || ((state[0] >> j) & 0xf) != 0) ||
        (((state[1] >> j) & 0xf) == 0 && (((state[0] >> j+16) & 0xf) != 0 || ((state[0] >> j) & 0xf) != 0)) ||
        (((state[0] >> j+16) & 0xf) == 0 && ((state[0] >> j) & 0xf) != 0)) return true;

    // equal non-empty vertically-adjacent spaces (collapsible tile pair)
    if (((state[0] >> j) & 0xf) != 0 && ((state[0] >> j) & 0xf) == ((state[0] >> j+16) & 0xf)) return true;
    if (((state[0] >> j+16) & 0xf) != 0 && ((state[0] >> j+16) & 0xf) == ((state[1] >> j) & 0xf)) return true;
    if (((state[1] >> j) & 0xf) != 0 && ((state[1] >> j) & 0xf) == ((state[1] >> j+16) & 0xf)) return true;
  }

  return false;
}

function canMoveUp(state) {
  for (var j=0; j<16; j+=4) {
    // empty space above filled space
    if (((state[0] >> j) & 0xf) == 0 && (((state[0] >> j+16) & 0xf) != 0 || ((state[1] >> j) & 0xf) != 0 || ((state[1] >> j+16) & 0xf) != 0) ||
        (((state[0] >> j+16) & 0xf) == 0 && (((state[1] >> j) & 0xf) != 0 || ((state[1] >> j+16) & 0xf) != 0)) ||
        (((state[1] >> j) & 0xf) == 0 && ((state[1] >> j+16) & 0xf) != 0)) return true;

    // equal non-empty vertically-adjacent spaces (collapsible tile pair)
    if (((state[0] >> j) & 0xf) != 0 && ((state[0] >> j) & 0xf) == ((state[0] >> j+16) & 0xf)) return true;
    if (((state[0] >> j+16) & 0xf) != 0 && ((state[0] >> j+16) & 0xf) == ((state[1] >> j) & 0xf)) return true;
    if (((state[1] >> j) & 0xf) != 0 && ((state[1] >> j) & 0xf) == ((state[1] >> j+16) & 0xf)) return true;
  }

  return false;
}

function canMoveRight(state) {
  for (var i=0; i<2; i++) {
    for (var j=0; j<=16; j+=16) {
      // empty space to the right of filled space
      if (((state[i] >> j+12) & 0xf) == 0 && (((state[i] >> j+8) & 0xf) != 0 || ((state[i] >> j+4) & 0xf) != 0 || ((state[i] >> j) & 0xf) != 0) ||
          (((state[i] >> j+8) & 0xf) == 0 && (((state[i] >> j+4) & 0xf) != 0 || ((state[i] >> j) & 0xf) != 0)) ||
          (((state[i] >> j+4) & 0xf) == 0 && ((state[i] >> j) & 0xf) != 0)) return true;

      // equal non-empty horizontally-adjacent spaces (collapsible tile pair)
      if (((state[i] >> j) & 0xf) != 0 && ((state[i] >> j) & 0xf) == ((state[i] >> j+4) & 0xf)) return true;
      if (((state[i] >> j+4) & 0xf) != 0 && ((state[i] >> j+4) & 0xf) == ((state[i] >> j+8) & 0xf)) return true;
      if (((state[i] >> j+8) & 0xf) != 0 && ((state[i] >> j+8) & 0xf) == ((state[i] >> j+12) & 0xf)) return true;
    }
  }

  return false;
}

function canMoveLeft(state) {
  for (var i=0; i<2; i++) {
    for (var j=0; j<=16; j+=16) {
      // empty space to the right of filled space
      if (((state[i] >> j) & 0xf) == 0 && (((state[i] >> j+4) & 0xf) != 0 || ((state[i] >> j+8) & 0xf) != 0 || ((state[i] >> j+12) & 0xf) != 0) ||
          (((state[i] >> j+4) & 0xf) == 0 && (((state[i] >> j+8) & 0xf) != 0 || ((state[i] >> j+12) & 0xf) != 0)) ||
          (((state[i] >> j+8) & 0xf) == 0 && ((state[i] >> j+12) & 0xf) != 0)) return true;

      // equal non-empty horizontally-adjacent spaces (collapsible tile pair)
      if (((state[i] >> j) & 0xf) != 0 && ((state[i] >> j) & 0xf) == ((state[i] >> j+4) & 0xf)) return true;
      if (((state[i] >> j+4) & 0xf) != 0 && ((state[i] >> j+4) & 0xf) == ((state[i] >> j+8) & 0xf)) return true;
      if (((state[i] >> j+8) & 0xf) != 0 && ((state[i] >> j+8) & 0xf) == ((state[i] >> j+12) & 0xf)) return true;
    }
  }

  return false;
}

// move* assumes canMove* has been called first.
function moveLeft(state) {
  for (var i=0; i<2; i++) {
    for (var j=0; j<32; j+=16) {
      // collapse all empty spaces to the left first.
      var nonZeros = [];
      for (var k=0; k<16; k+=4) {
        var val = (state[i] >> (j+k)) & 0xf;
        if (val != 0) {
          nonZeros.push(val);
          state[i] ^= (val << (j+k));
        }
      }

      // now collapse adjacent equal numbers to the left (but only once!)
      for (var k=0; k<nonZeros.length-1; k++) {
        if (nonZeros[k] == nonZeros[k+1]) {
          nonZeros[k] = nonZeros[k] + 1;
          nonZeros.splice(k+1, 1);
        }
      }

      for (var k=0; k<nonZeros.length; k++) {
        state[i] |= nonZeros[k] << (j+k*4);
      }
    }
  }

  return state;
}

function moveRight(state) {
  for (var i=0; i<2; i++) {
    for (var j=16; j>=0; j-=16) {
      // collapse all empty spaces to the right first.
      var nonZeros = [];
      for (var k=12; k>=0; k-=4) {
        var val = (state[i] >> (j+k)) & 0xf;
        if (val != 0) {
          nonZeros.push(val);
          state[i] ^= (val << (j+k));
        }
      }

      // now collapse adjacent equal numbers to the left (but only once!)
      for (var k=0; k<nonZeros.length-1; k++) {
        if (nonZeros[k] == nonZeros[k+1]) {
          nonZeros[k] = nonZeros[k] + 1;      // x*2 = 1 + log2(x)
          nonZeros.splice(k+1, 1);
        }
      }

      var idx = 12;
      for (var k=0; k<nonZeros.length; k++) {
        state[i] |= nonZeros[k] << (j+idx);
        idx-=4;
      }
    }
  }

  return state;
}

function moveUp(state) {
  for (var j=0; j<16; j+=4) {
    var nonZeros = [];
    for (var k=0; k<64; k+=16) {
      var idx = (j+k) >> 5;
      var val = (state[idx] >> ((j+k) & 0x1f)) & 0xf;
      if (val != 0) {
        nonZeros.push(val);
        state[idx] ^= (val << ((j+k) & 0x1f));
      }
    }

    // now collapse adjacent equal numbers up (but only once!)
    for (var k=0; k<nonZeros.length-1; k++) {
      if (nonZeros[k] == nonZeros[k+1]) {
        nonZeros[k] = nonZeros[k] + 1;
        //nonZeros[k+1] = 0;
        nonZeros.splice(k+1, 1);
      }
    }

    for (var k=0; k<nonZeros.length; k++) {
      state[(j+(k<<4)) >> 5] |= nonZeros[k] << ((j+(k<<4)) & 0x1f);
    }
  }

  return state;
}

function moveDown(state) {
  for (var j=0; j<16; j+=4) {
    var nonZeros = [];
    for (var k=48; k>=0; k-=16) {
      var idx = (j+k) >> 5;
      var val = (state[idx] >> ((j+k) & 0x1f)) & 0xf;
      if (val != 0) {
        nonZeros.push(val);
        state[idx] ^= (val << ((j+k) & 0x1f));
      }
    }

    // now collapse adjacent equal numbers up (but only once!)
    for (var k=0; k<nonZeros.length-1; k++) {
      if (nonZeros[k] == nonZeros[k+1]) {
        nonZeros[k] = nonZeros[k] + 1;
        nonZeros.splice(k+1, 1);
      }
    }

    var idx = 48;
    for (var k=0; k<nonZeros.length; k++) {
      state[(j+idx) >> 5] |= nonZeros[k] << ((j+idx) & 0x1f);
      idx -= 16;
    }
  }

  return state;
}

Player.prototype.evalPosition = function(state) {
  // evaluation components are:
  //   - number of empty tiles (higher is exponentially better)
  //   - value of 3 largest tiles (incentivizes combining tiles, next higher tile is worth more than 2x its components)
  //   - total tile "exposure" (lower is better)
  // "exposure" can be defined by the difference in magnitude of adjacent tiles.
  // this heuristic reflects the observation that the position is stronger when high-value tiles are grouped together.
  // a bonus is applied, scaling with the tile value, for a tile on a side or in a corner.

  var emptyTiles = 0;
  var lg = 0;
  var lg2 = 0;
  var lg3 = 0;
  var totalExposure = 0;

  for (var offset=0; offset<64; offset+=4) {
    var val = (state[offset>>5] >> (offset & 0x1f)) & 0xf;

    if (val == 0) {
      emptyTiles++;
    }
    else {
      if (val > lg) {
        lg3 = lg2;
        lg2 = lg;
        lg = val;
      }
      else if (val > lg2) {
        lg3 = lg2;
        lg2 = val;
      }
      else if (val > lg3) {
        lg3 = val;
      }

      var exposure = 0;

      if (offset >= 16) {
        // check for exposure above.
        var above = ((state[(offset-16)>>5] >> ((offset-16) & 0x1f)) & 0xf);
        if (val >= above) {
          exposure += (val-above)*(val-above);
        }
      }
      else {
        exposure -= val*val;      // favor sides/corners, in proportion to tile value
      }
      if (offset < 48) {
        // check for exposure below.
        var below = ((state[(offset+16)>>5] >> ((offset+16) & 0x1f)) & 0xf);
        if (val >= below) {
          exposure += (val-below)*(val-below);
        }
      }
      else {
        exposure -= val*val;      // favor sides/corners, in proportion to tile value
      }
      if ((offset & 0xf) < 12) {
        // check for exposure to the right.
        var right = ((state[(offset+4)>>5] >> ((offset+4) & 0x1f)) & 0xf);
        if (val >= right) {
          exposure += (val-right)*(val-right);
        }
      }
      else {
        exposure -= val*val;      // favor sides/corners, in proportion to tile value
      }
      if ((offset & 0xf) >= 4) {
        // check for exposure to the left.
        var left = ((state[(offset-4)>>5] >> ((offset-4) & 0x1f)) & 0xf);
        if (val >= left) {
          exposure += (val-left)*(val-left);
        }
      }
      else {
        exposure -= val*val;      // favor sides/corners, in proportion to tile value
      }

      totalExposure += exposure;

      //console.log("exposure for position " + i + " " + j + ": " + exposure);
    }
  }

  var score;
  if (lg == 11) {
    score = Player.MAX_SCORE;     // 2048 tile found, position won.
  }
  else {
    score = emptyTiles*emptyTiles*emptyTiles - totalExposure + Player.TILE_VALUES[lg] + Player.TILE_VALUES[lg2] + Player.TILE_VALUES[lg3];
  }

  //console.log(score);
  return score;
};

Player.prototype.readableMove = function(move) {
  if (typeof move.move == "number")
    return Player.MOVE_TEXT[move.move];
  return move.move.value + " at " + move.move.position.x + "," + move.move.position.y;
};
