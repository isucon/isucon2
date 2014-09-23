require 'sinatra/base'
require 'slim'
require 'json'
require 'mysql2'
require 'net/http'

if ENV['RACK_ENV'] != 'production'
  require 'pry'
  require "rack-lineprof"
end

module Net
  class HTTP::Purge < HTTPRequest
        METHOD='PURGE'
        REQUEST_HAS_BODY = false
        RESPONSE_HAS_BODY = true
  end
end

class Isucon2App < Sinatra::Base
  $stdout.sync = true if development?
  set :slim, :pretty => true, :layout => true
  set :port, 3000 if development?

  if development?
    use Rack::Lineprof, profile: "views/*|app.rb"
  end

  helpers do
    def development?
      !production?
    end

    def production?
      ENV['RACK_ENV'] == 'production'
    end

    def purge_cache(uri)
      uri = uri.is_a?(URI) ? uri : URI.parse(uri)
      Net::HTTP.start(uri.host,uri.port) do |http|
        presp = http.request Net::HTTP::Purge.new uri.request_uri
        $stdout.puts "#{presp.code}: #{presp.message}" if development?
        unless (200...400).include?(presp.code.to_i)
          $stdout.puts "A problem occurred. PURGE was not performed(#{presp.code.to_i}): #{uri.request_uri}"
        else
          $stdout.puts "Cache purged (#{presp.code.to_i}): #{uri.request_uri}" if development?
        end
      end
    end

    def connection
      return @connection if defined?(@connection)

      config = JSON.parse(IO.read(File.dirname(__FILE__) + "/../config/common.#{ ENV['ISUCON_ENV'] || 'local' }.json"))['database']
      @connection = Mysql2::Client.new(
        :host => config['host'],
        :port => config['port'],
        :username => config['username'],
        :password => config['password'],
        :database => config['dbname'],
        :reconnect => true,
      )
    end

    def recent_sold
      mysql = connection
      recent_sold = mysql.query('SELECT seat_id, a_name, t_name, v_name FROM recent_sold ORDER BY order_id DESC LIMIT 10')

      if recent_sold.size > 0
        recent_sold
      else
        update_recent_sold
      end
    end

    def update_recent_sold
      mysql = connection
      recent_sold = mysql.query(
        'SELECT stock.seat_id, variation.name AS v_name, ticket.name AS t_name, artist.name AS a_name FROM stock
           JOIN variation ON stock.variation_id = variation.id
           JOIN ticket ON variation.ticket_id = ticket.id
           JOIN artist ON ticket.artist_id = artist.id
         WHERE order_id IS NOT NULL
         ORDER BY order_id DESC LIMIT 10',
      ).to_a

      values = recent_sold.map { |data|
        %Q{('#{data["seat_id"]}',#{data["order_id"] ? data["order_id"] : "NULL" },'#{data["a_name"]}','#{data["t_name"]}','#{data["v_name"]}')}
      }.join(",")
      mysql.query(
        "INSERT INTO recent_sold (seat_id, order_id, a_name, t_name, v_name)
         VALUES #{values}
         ON DUPLICATE KEY UPDATE
           recent_sold.seat_id=VALUES(seat_id),
           recent_sold.order_id=VALUES(order_id),
           recent_sold.a_name=VALUES(a_name),
           recent_sold.t_name=VALUES(t_name),
           recent_sold.v_name=VALUES(v_name)
        "
      )

      recent_sold
    end
  end

  # main

  get '/' do
    mysql = connection
    artists = mysql.query("SELECT * FROM artist ORDER BY id")
    slim :index, :locals => {
      :artists => artists,
    }
  end

  get '/artist/:artistid' do
    mysql = connection
    artist  = mysql.query(
      "SELECT id, name FROM artist WHERE id = #{ params[:artistid] } LIMIT 1",
    ).first
    tickets = mysql.query(
      "SELECT id, name FROM ticket WHERE artist_id = #{ artist['id'] } ORDER BY id",
    )
    tickets.each do |ticket|
      ticket["count"] = mysql.query(
        "SELECT COUNT(*) AS cnt FROM variation
         INNER JOIN stock ON stock.variation_id = variation.id
         WHERE variation.ticket_id = #{ ticket['id'] } AND stock.order_id IS NULL",
      ).first["cnt"]
    end
    slim :artist, :locals => {
      :artist  => artist,
      :tickets => tickets,
    }
  end

  get '/ticket/:ticketid' do
    mysql = connection
    ticket = mysql.query(
      "SELECT t.*, a.name AS artist_name FROM ticket t
       INNER JOIN artist a ON t.artist_id = a.id
       WHERE t.id = #{ params[:ticketid] } LIMIT 1",
    ).first

    variations = mysql.query("SELECT id, name FROM variation WHERE ticket_id = #{ ticket['id'] } ORDER BY id").to_a
    variations.each do |variation|
      variation["count"] = mysql.query("SELECT COUNT(*) AS cnt FROM stock WHERE variation_id = #{ variation['id'] } AND order_id IS NULL").first["cnt"]
      variation["stock"] = {}

      stocks = mysql.query("SELECT seat_id, order_id FROM stock WHERE variation_id = #{ variation['id'] }").to_a
      stocks.each do |stock|
        variation["stock"][stock["seat_id"]] = stock["order_id"]
      end
    end
    slim :ticket, locals: {
      ticket: ticket,
      variations: variations,
    }
  end

  post '/buy' do
    mysql = connection
    mysql.query('BEGIN')
    mysql.query("INSERT INTO order_request (member_id) VALUES ('#{ params[:member_id] }')")
    order_id = mysql.last_id
    mysql.query(
      "UPDATE stock SET order_id = #{ order_id }
       WHERE variation_id = #{ params[:variation_id] } AND order_id IS NULL
       ORDER BY RAND() LIMIT 1",
    )
    if mysql.affected_rows > 0
      update_recent_sold

      seat_id = mysql.query(
        "SELECT seat_id FROM stock WHERE order_id = #{ order_id } LIMIT 1",
      ).first['seat_id']
      mysql.query('COMMIT')

      ticket_id = mysql.query(
        "SELECT ticket_id FROM variation WHERE id = #{ mysql.escape(params[:variation_id]) } LIMIT 1",
      ).first['ticket_id']

      if production?
        purge_cache('http://127.0.0.1/')
        purge_cache("http://127.0.0.1/ticket/#{ticket_id}")
      end

      slim :complete, :locals => { :seat_id => seat_id, :member_id => params[:member_id] }
    else
      mysql.query('ROLLBACK')
      slim :soldout
    end
  end

  # admin

  get '/admin' do
    slim :admin
  end

  get '/admin/order.csv' do
    mysql = connection
    body  = ''
    orders = mysql.query(
      'SELECT order_request.*, stock.seat_id, stock.variation_id, stock.updated_at
       FROM order_request JOIN stock ON order_request.id = stock.order_id
       ORDER BY order_request.id ASC',
    )
    orders.each do |order|
      order['updated_at'] = order['updated_at'].strftime('%Y-%m-%d %X')
      body += order.values_at('id', 'member_id', 'seat_id', 'variation_id', 'updated_at').join(',')
      body += "\n"
    end
    [200, { 'Content-Type' => 'text/csv' }, body]
  end

  post '/admin' do
    mysql = connection
    open(File.dirname(__FILE__) + '/../config/database/initial_data.sql') do |file|
      file.each do |line|
        next unless line.strip!.length > 0
        mysql.query(line)
      end
    end
    redirect '/admin', 302
  end

  run! if app_file == $0
end
