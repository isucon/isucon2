### HOW TO RUN ###

    $ easy_install flask MySQL-python gunicorn
    $ gunicorn -c gunicorn_config.py -w 10 app:app

