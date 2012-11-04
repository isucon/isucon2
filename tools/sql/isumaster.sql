CREATE DATABASE IF NOT EXISTS isumaster2 DEFAULT CHARACTER SET 'utf8';

CREATE USER 'isumaster2'@'%' IDENTIFIED BY 'throwing';
GRANT ALL ON isumaster2.* TO 'isumaster2'@'%';
CREATE USER 'isumaster2'@'localhost' IDENTIFIED BY 'throwing';
GRANT ALL ON isumaster2.* TO 'isumaster2'@'localhost';

FLUSH PRIVILEGES;

CREATE TABLE IF NOT EXISTS isumaster2.results (
  `id`     INT UNSIGNED NOT NULL PRIMARY KEY AUTO_INCREMENT,
  `teamid` INT UNSIGNED NOT NULL,
  `failed` INT UNSIGNED NOT NULL,
  `score` INT SIGNED DEFAULT NULL,
  `tickets`  INT UNSIGNED NOT NULL,
  `soldouts` INT UNSIGNED NOT NULL,
  `soldoutAt` INT UNSIGNED DEFAULT NULL,
  `gets`     INT UNSIGNED NOT NULL,
  `posts`    INT UNSIGNED NOT NULL,
  `errors`   INT UNSIGNED NOT NULL,
  `timeouts` INT UNSIGNED NOT NULL,
  `detail` TEXT DEFAULT NULL,
  `inserted_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `recent` (`teamid`,`id`),
  KEY `highscore` (`teamid`,`tickets`,`score`)
) ENGINE=InnoDB;

