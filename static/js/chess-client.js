$(document).ready(function() {
	var protocol = (location.protocol == 'http:') ? 'ws://' : 'wss://';
	var host     = document.location.host;
	var socket   = new WebSocket(protocol + host + '/game');
	var game     = new Chess(socket);

	socket.onmessage = function(event) {
		console.log('Data is received: ' + event.data);
		
		game.get_message(event.data);
	};
	
	socket.onopen = function() {
		console.log('Connect is setted');

		game.start();
	};
	
	socket.onclose = function(event) {
		console.log((event.wasClean) ? 'Connect is closed' :
									   'Connect is broken');
		game.end();
	};
	
	socket.onerror = function(error) {
		console.log('Error: ' + error.message);
	};
});


function Chess(socket) {
	var MsgTypes = {
		NEW_GAME: 0,
		UPDATE_LIST: 1,
		BREAK_WAIT: 2,
		CONNECT: 3,
		MAKE_MOVE: 4,
		LIST_PLAYERS: 5,
		ADD_PLAYER: 6,
		REMOVE_PLAYER: 7,
		START_GAME: 8,
		BREAK_GAME: 9,
		UPDATE_BOARD: 10,
	};
	
	this.dom    = new Dom(this);
	this.socket = socket;
	
	this.start = function() {
		this.dom.init();
	};

	this.end = function() {
		console.log('Game end');
		this.dom.destroy();
	};
	
	this.get_message = function(msg) {
		var dom = this.dom;
		msg = JSON.parse(msg);
		switch (msg.type) {
			case MsgTypes.ADD_PLAYER:
				dom.add_player(msg.content);
				break;
			case MsgTypes.LIST_PLAYERS:
				dom.update_list(msg.content);
				break;
			case MsgTypes.START_GAME:
				dom.start_game(msg.content);
				break;
			case MsgTypes.REMOVE_PLAYER:
				dom.remove_player(msg.content);
				break;
			case MsgTypes.BREAK_GAME:
				dom.clear();
				break;
			case MsgTypes.UPDATE_BOARD:
				dom.board.update(msg.content);
				break;
			default:
				console.log('Unknown message');
		}
	};

	this.create_party = function() {
		var msg = create_msg(MsgTypes.NEW_GAME);
		this.socket.send(msg);
	};

	this.connect = function(id_party) {
		var msg = create_msg(MsgTypes.CONNECT, id_party);
		this.socket.send(msg);
	};
	
	this.get_list_parties = function() {
		var msg = create_msg(MsgTypes.UPDATE_LIST);
		this.socket.send(msg);
	};

	this.break_wait = function() {
		var msg = create_msg(MsgTypes.BREAK_WAIT);
		this.socket.send(msg);
	};

	this.make_move = function(move) {
		var msg = create_msg(MsgTypes.MAKE_MOVE, move);
		this.socket.send(msg);
	};

	function create_msg() {
		msg = {'type': arguments[0]}
		if (arguments.length > 1)
			msg.content = arguments[1]
		msg = JSON.stringify(msg);
		return msg
	};
};


function Dom(game) {
	this.board = new Board(game);
	this.game = game;
	
	var self = this; // save access for event handlers
	
	this.init = function() {
		$('#search_game').css("display", "block");
		
		// bind handlers on elements of DOM
		$('#table_parties').bind("click", function(event) {
			var id_party = event.target.id;
			self.game.connect(id_party);
		});
		
		$('#button_create_party').bind("click", function(event) {
			self.game.create_party();
			self.wait_partner();
		});
		
		$('#button_return_to_search').bind("click", function(event) {
			self.game.break_wait();
			clear_list();
			$('#wait_partner').css("display", "none");
			$('#search_game').css("display", "block");
		});
	};

	this.destroy = function() {
		// hide all content
		$('#search_game').css("display", "none");
		$('#wait_partner').css("display", "none");
		$('#game').css("display", "none");
	};

	this.update_list = function(players) {
		clear_list();
		var table = $('#table_parties');
		for (var i = 0, n = players.length; i < n; i++) {
			var record = '<li id=\"' + players[i] + '\">New chess party</li>';
			table.append(record);
		}
	};

	this.add_player = function(player) {
		var record = '<li id=\"' + player + '\">Chess party</li>';
		$('#table_parties').append(record);
	};

	this.remove_player = function(player) {
		$('#' + player).remove();
	};

	this.wait_partner = function() {
		$('#search_game').css("display", "none");
		$('#wait_partner').css("display", "block");
	};

	this.start_game = function(msg) {
		$('#search_game').css("display", "none");
		$('#wait_partner').css("display", "none");
		$('#game').css("display", "block");
		this.board.init(msg);
	};

	this.clear = function() {
		$('#game').css("display", "none");
		clear_list();
		this.game.get_list_parties();
		$('#search_game').css("display", "block");
	};

	function clear_list() {
		$('#table_parties').empty();
	};
};


function Board(game) {
	var ColourTypes = {
		LIGHT: 0,
		DARK:  1,
	};

	var FigureTypes = {
		PAWN: 0,
		ROOK: 1,
		BISHOP: 2,
		KNIGHT: 3,
		QUEEN: 4,
		KING: 5,
	};
	
	var BOARD_SIZE = $('#board')[0].height;
	var NCELLS     = 8; // number cells on chess board
	var CELL_SIZE  = Math.floor(BOARD_SIZE / NCELLS);

	this.game     = game;
	this.ctx      = $('#board')[0].getContext('2d');
	this.images   = get_images();
	this.board    = get_board();
	this.figures  = null;
	this.colour   = null;
	this.select   = null;
	this.lock     = false;
	this.my_move  = false;

	var self = this;

	$('#board').bind("click", function(event) {
		if (!self.lock) {
			var x = Math.floor(event.offsetX / CELL_SIZE);
			var y = Math.floor(event.offsetY / CELL_SIZE);
			
			var colour = self.colour;
			var update = invert(x, y, colour);
			x = update[0];
			y = update[1];
			
			var figure = self.board[x][y];
			if (self.select !== null) {
				if ((figure !== null) && (figure.colour === colour)) {
					// player change own choose
					self.select = figure;
				} else {
					// player make a move
					var msg = {
						'move': [self.select.x, self.select.y, x, y],
					};
					self.game.make_move(msg);
					self.select = null;
					self.lock   = true;
				}
			} else if ((figure !== null) && (figure.colour === colour)) {
				// player choose own figure
				self.select = figure;
			}
		}
	});

	this.init = function(msg) {
		console.log('Initialize board');
		
		this.colour   = msg.colour;
		this.select   = null;
		this.my_move  = (msg.colour === ColourTypes.LIGHT) ? true : false;
		this.lock     = (msg.colour === ColourTypes.DARK) ? true : false;
		this.figures  = get_figures();
		
		board   = this.board;
		figures = this.figures;
		set_null_board(board);
		insert_figures(board, figures);
		this.draw();
	};
	
	this.update = function(move) {
		var my_move  = !this.my_move;
		this.lock    = (my_move === true) ? false : true;
		this.my_move = my_move;
		
		change_state_board(this.board, this.figures, move);
		this.draw();
	};

	this.draw = function() {
		var ctx = this.ctx,
		figures = this.figures,
		colour  = this.colour,
		images  = this.images;
		
		ctx.drawImage(images.board, 0, 0, BOARD_SIZE, BOARD_SIZE);
		draw_figures(ctx, figures, colour, images);
	};

	function draw_figures(ctx, figures, colour, images) {
		for (var i = 0, n = figures.length; i < n; i++) {
			var figure = figures[i],
			x = figure.x,
			y = figure.y,
			type = figure.get_type(),
			img = images[type][figure.colour];
			
			var update = invert(x, y, colour);
			x = update[0] * CELL_SIZE;
			y = update[1] * CELL_SIZE;
			
			ctx.drawImage(img, x, y, CELL_SIZE, CELL_SIZE);
		}
	};
	
	function change_state_board(board, figures, move) {
		var old_x = move[0],
		old_y = move[1],
		new_x = move[2],
		new_y = move[3];

		var figure = board[new_x][new_y];
		if (figure !== null) {
			// remove figure
			var i = figures.indexOf(figure);
			figures.splice(i, 1);
		}
		figure = board[old_x][old_y];
		board[old_x][old_y] = null;
		figure.x = new_x;
		figure.y = new_y;
		board[new_x][new_y] = figure;
	};

	function get_board() {
		for (var i = 0, board = []; i < NCELLS; i++)
			board.push([null, null, null, null, null, null, null, null]);
		return board;
	};
	
	function get_figures() {
		var figures = [];

		for (var i = 0; i < NCELLS; i++)
			push_figures(figures, Pawn, i, 1, 6)
		
		for (var i = 0; i < NCELLS; i += 7)
			push_figures(figures, Rook, i, 0, 7)
		
		for (var i = 1; i < NCELLS; i += 5)
			push_figures(figures, Knight, i, 0, 7)
		
		for (var i = 2; i < NCELLS; i += 3)
			push_figures(figures, Bishop, i, 0, 7)
		
		push_figures(figures, Queen, 3, 0, 7)
		push_figures(figures, King, 4, 0, 7)
		
		return figures;
	}

	function push_figures(figures, Constuctor, x, y1, y2) {
		figures.push(new Constuctor(x, y1, ColourTypes.LIGHT));
		figures.push(new Constuctor(x, y2, ColourTypes.DARK));
	}

	function set_null_board(board) {
		for (var i = 0; i < NCELLS; i++)
			for (var j = 0; j < NCELLS; j++)
				board[i][j] = null;
	};

	function insert_figures(board, figures) {
		for (var i = 0, n = figures.length; i < n; i++) {
			var figure = figures[i],
			x = figure.x, y = figure.y;
			board[x][y] = figure;
		}
	};

	function invert(x, y, colour) {
		if (colour === ColourTypes.LIGHT) {
			y = 7 - y;
		} else {
			x = 7 - x;
		}
		return [x, y];
	};

	function get_images() {
		var images = {};

		images.board = $('#board_img')[0];

		images[FigureTypes.PAWN] = [
			$('#img_light_pawn')[0], 
			$('#img_dark_pawn')[0],
		];
		
		images[FigureTypes.ROOK] = [
			$('#img_light_rook')[0], 
			$('#img_dark_rook')[0],
		];
		
		images[FigureTypes.BISHOP] = [
			$('#img_light_bishop')[0],
			$('#img_dark_bishop')[0],
		];
		
		images[FigureTypes.KNIGHT] = [
			$('#img_light_knight')[0],
			$('#img_dark_knight')[0],
		];
		
		images[FigureTypes.QUEEN] = [
			$('#img_light_queen')[0],
			$('#img_dark_queen')[0],
		];
		
		images[FigureTypes.KING] = [
			$('#img_light_king')[0],
			$('#img_dark_king')[0],
		];

		return images;
	};

	function Pawn(x, y, colour) {
		Figure.call(this, x, y, colour);
	};

	Pawn.prototype.get_type = function() {
		return FigureTypes.PAWN;
	};

	function Rook(x, y, colour) {
		Figure.call(this, x, y, colour);
	};

	Rook.prototype.get_type = function() {
		return FigureTypes.ROOK;
	};

	function Bishop(x, y, colour) {
		Figure.call(this, x, y, colour);
	};

	Bishop.prototype.get_type = function() {
		return FigureTypes.BISHOP;
	};

	function Knight(x, y, colour) {
		Figure.call(this, x, y, colour);
	};

	Knight.prototype.get_type = function() {
		return FigureTypes.KNIGHT;
	};

	function Queen(x, y, colour) {
		Figure.call(this, x, y, colour);
	};

	Queen.prototype.get_type = function() {
		return FigureTypes.QUEEN;
	};

	function King(x, y, colour) {
		Figure.call(this, x, y, colour);
	};

	King.prototype.get_type = function() {
		return FigureTypes.KING;
	};

	function Figure(x, y, colour) {
		this.x = x;
		this.y = y;
		this.colour = colour;
	};
};
