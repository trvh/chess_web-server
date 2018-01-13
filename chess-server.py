import tornado.httpserver
import tornado.websocket
import tornado.ioloop
import tornado.web

import chess

class Chess_handler(tornado.websocket.WebSocketHandler):
	
	game = chess.Chess()

	def open(self):
		self.game.add_player(self)

	def on_message(self, message):
		self.game.get_message(self, message)

	def on_close(self):
		self.game.remove_player(self)
 
	def check_origin(self, origin):
		return True

class Search_game(tornado.web.RequestHandler):
    def get(self):
        self.render('templates/index.html')

if __name__ == '__main__':
	app = tornado.web.Application([
		(r'/', Search_game),
		(r'/game', Chess_handler),
		(r'/static/(.*)', tornado.web.StaticFileHandler, {'path': './static/'}),
	])
	http_server = tornado.httpserver.HTTPServer(app)
	http_server.listen(8080)
	tornado.ioloop.IOLoop.instance().start()
