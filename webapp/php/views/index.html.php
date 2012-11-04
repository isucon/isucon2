<h1>TOP</h1>
<ul>
<?php foreach ($artists as $artist) { ?>
  <li>
    <a href="/artist/<?= $artist['id'] ?>">
      <span class="artist_name"><?= $artist['name'] ?></span>
    </a>
  </li>
<?php } ?>
</ul>
