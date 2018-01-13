from enum import Enum
from sys  import stderr
import json


class MsgTypes(Enum):
	
	NEW_GAME = 0
	UPDATE_LIST = 1
	BREAK_WAIT = 2
	CONNECT = 3
	MAKE_MOVE = 4
	LIST_PLAYERS = 5
	ADD_PLAYER = 6
	REMOVE_PLAYER = 7
	START_GAME = 8
	BREAK_GAME = 9
	UPDATE_BOARD = 10


class StatePlayer(Enum):
	
	SEARCH = 0
	WAIT = 1
	PLAY = 2


class ColourTypes(Enum):
	
	LIGHT = 0
	DARK = 1


class FigureTypes(Enum):

	PAWN = 0
	ROOK = 1
	BISHOP = 2
	KINGHT = 3
	QUEEN = 4
	KING = 5


def create_msg(type_msg, content=None):
	msg = {'type': type_msg}
	if content != None:
		msg['content'] = content
	msg = json.dumps(msg)
	return msg


class Chess:
	
	def __init__(self):
		self.searchers     = {} # players searching a party
		self.parties       = {} # players waiting for partner
		self.games         = {} # pairs which now playing
		self.state_players = {}
		self.handlers      = get_handlers()
	
	def add_player(self, player):
		'save new player'
		id_player = id(player)
		self.searchers[id_player] = player
		self.state_players[id_player] = (StatePlayer.SEARCH.value, )
		self.send_list_parties(player)
	
	def send_list_parties(self, player):
		'send list of parties to player'
		parties = [id_creator for id_creator in self.parties.keys()]
		msg = create_msg(MsgTypes.LIST_PLAYERS.value, parties)
		player.write_message(msg)
	
	def get_message(self, player, msg):
		msg   = json.loads(msg)
		index = msg['type']
		
		handlers = self.handlers
		if (index >= 0) and (index < len(handlers)):
			handler = handlers[index]
			try:
				handler(self, player, msg)
			except Exception as error:
				stderr.write('Error ' + str(error) + '\n')
		else:
			stderr.write('Unknow message\n')

	def send_dispatch(self, id_creator):
		dispatch = create_msg(MsgTypes.REMOVE_PLAYER.value, id_creator)
		self.send_msg_players(dispatch)

	def send_msg_players(self, msg):
		players = self.searchers
		for player in players.values():
			player.write_message(msg)
				
	def remove_player(self, player):
		id_player = id(player)
		state = self.state_players[id_player]
		state_type = state[0]

		if state_type == StatePlayer.SEARCH.value:
			self.searchers.pop(id_player)

		elif state_type == StatePlayer.WAIT.value:
			self.parties.pop(id_player)
			self.send_dispatch(id_player)

		elif state_type == StatePlayer.PLAY.value:
			id_party = state[1]
			party = self.games.pop(id_party)
			partner = party.get_partner(player)
			msg = create_msg(MsgTypes.BREAK_GAME.value)
			partner.write_message(msg)
			id_partner = id(partner)
			self.searchers[id_partner] = partner

		self.state_players.pop(id_player)


def new_game_handler(self, player, msg):
	# create new party and notify other players
	id_player = id(player)
	self.searchers.pop(id_player) # remove player
	self.parties[id_player] = player
	self.state_players[id_player] = (StatePlayer.WAIT.value, )

	dispatch = create_msg(MsgTypes.ADD_PLAYER.value, id_player)
	self.send_msg_players(dispatch)


def update_list_handler(self, player, msg):
	self.send_list_parties(player)


def break_wait_handler(self, player, msg):
	id_player = id(player)
	self.parties.pop(id_player) # remove player
	self.send_dispatch(id_player)
	self.searchers[id_player] = player
	self.state_players[id_player] = (StatePlayer.SEARCH.value, )
	self.send_list_parties(player)


def connect_handler(self, player, msg):
	id_player  = id(player)
	id_creator = int(msg['content'])
	creator = self.parties.pop(id_creator)
	self.searchers.pop(id_player) # remove player

	party    = Party(white=creator, black=player)
	id_party = party.get_id()
	self.games[id_party] = party

	new_state = (StatePlayer.PLAY.value, id_party, ) 
	self.state_players[id_player]  = new_state
	self.state_players[id_creator] = new_state
	
	self.send_dispatch(id_creator)
	
	state = {
		'id_party': id_party,
		'colour': ColourTypes.LIGHT.value,
	}
	msg = create_msg(MsgTypes.START_GAME.value, state)
	creator.write_message(msg)
	
	state['colour'] = ColourTypes.DARK.value
	msg = create_msg(MsgTypes.START_GAME.value, state)
	player.write_message(msg)


def make_move_handler(self, player, msg):
	content  = msg['content']
	id_party = content['id_party']
	move     = content['move']
	party    = self.games[id_party]
	partner  = party.get_partner(player)
	party.make_move(player, move)

	msg = create_msg(MsgTypes.UPDATE_BOARD.value, move)
	player.write_message(msg)
	partner.write_message(msg)


def get_handlers():
	return (
		new_game_handler,
		update_list_handler,
		break_wait_handler,
		connect_handler,
		make_move_handler,
	)


class BreakOrderError(Exception):
	pass

class Party:	
	
	def __init__(self, white, black):
		self.white = white
		self.black = black
		self.order = white # current player who is make a move
		self.board = Board()
	
	def get_id(self):
		return id(self.white) # id_creator
	
	def get_partner(self, player):
		return self.black if player is self.white else self.white

	def make_move(self, player, move):
		if self.order is player:
			self.board.update(move)
			self.order = self.get_partner(player)
		else:
			raise BreakOrderError('Break order')


class Board:
	
	def __init__(self):
		array   = get_array()
		figures = get_figures()
		insert_figures(array, figures)
		self.array   = array
		self.figures = figures

	def update(self, move):
		old_x, old_y, new_x, new_y = move
		board = self.array
		elem  = board[new_x][new_y]
		if elem != None:
			self.figures.remove(elem)

		figure = board[old_x][old_y]
		board[old_x][old_y] = None
		figure.x = new_x
		figure.y = new_y
		board[new_x][new_y] = figure


def get_array():
	return [[None for _ in range(8)] for _ in range(8)] 


def get_figures():
	figures = []
	for i in range(8):
		push_figures(figures, Pawn, i, 1, 6)

	for i in range(0, 8, 7):
		push_figures(figures, Rook, i, 0, 7)
	
	for i in range(1, 8, 5):
		push_figures(figures, Knight, i, 0, 7)
	
	for i in range(2, 8, 3):
		push_figures(figures, Bishop, i, 0, 7)
		
	push_figures(figures, Queen, 3, 0, 7)
	push_figures(figures, King, 4, 0, 7)
	
	return figures


def push_figures(figures, Constructor, x, y1, y2):	
	figures.append(Constructor(x, y1, ColourTypes.LIGHT.value))
	figures.append(Constructor(x, y2, ColourTypes.DARK.value))
		

def insert_figures(board, figures):
	for figure in figures:
		x = figure.x
		y = figure.y
		board[x][y] = figure

class Figure:
	
	def __init__(self, x, y, colour):
		self.x = x
		self.y = y
		self.colour = colour


class Pawn(Figure):
	
	def __init__(self, x, y, colour):
		super().__init__(x, y, colour)


class Rook(Figure):
	
	def __init__(self, x, y, colour):
		super().__init__(x, y, colour)


class Bishop(Figure):
	
	def __init__(self, x, y, colour):
		super().__init__(x, y, colour)


class Knight(Figure):
	
	def __init__(self, x, y, colour):
		super().__init__(x, y, colour)


class Queen(Figure):
	
	def __init__(self, x, y, colour):
		super().__init__(x, y, colour)


class King(Figure):
	
	def __init__(self, x, y, colour):
		super().__init__(x, y, colour)
