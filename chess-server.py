import tornado.httpserver
import tornado.websocket
import tornado.ioloop
import tornado.web

import chess


class MainHandler(tornado.web.RequestHandler):

	def get(self):
		self.render('templates/index.html')


class ChessHandler(tornado.websocket.WebSocketHandler):
	
	game = chess.Chess()

	def open(self):
		self.game.add_player(self)

	def on_message(self, message):
		self.game.get_message(self, message)

	def on_close(self):
		self.game.remove_player(self)
 
	def check_origin(self, origin):
		return True


def check_ip(ip):
	import socket
	socket.inet_aton(ip)


def check_port(port):
	if not (port >= 0 and port < 65536):
		raise Exception('Invalid number port')


def get_ip_port():
	import sys
	n = len(sys.argv)
	if n == 3:
		ip   = sys.argv[1]
		port = int(sys.argv[2])
		check_ip(ip)
		check_port(port)
		return (ip, port, )
	elif n == 1:
		ip   = '0.0.0.0'
		port = 8080
		return (ip, port, )
	else:
		raise Exception('Invalid input')


def main(ip, port):
	app = tornado.web.Application([
		(r'/', MainHandler),
		(r'/game', ChessHandler),
		(r'/static/(.*)', tornado.web.StaticFileHandler, {'path': './static/'}),
	])

	http_server = tornado.httpserver.HTTPServer(app)
	http_server.listen(port, address=ip)
	tornado.ioloop.IOLoop.instance().start()


if __name__ == '__main__':
	ip, port = get_ip_port()
	print('Current ip-address:port - {0}:{1}'.format(ip, port))
	main(ip, port)
