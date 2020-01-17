<template>
  <el-dialog
    append-to-body
    custom-class="app-dialog add-download-dialog"
    :title="$t('_add_download')"
    :show-close="false"
    :close-on-click-modal="false"
    :width="'400px'"
    :visible.sync="show"
    v-loading="checking"
    element-loading-text="Checking user login status..."
  >
    <el-form
      ref="addDownloadForm"
      size="mini"
      :model="download"
      :rules="addDownloadRule"
    >
      <el-form-item
        label="URL"
        :label-width="formLabelWidth"
      >
        <el-input
          ref="urlInput"
          v-model="download.url"
        ></el-input>
      </el-form-item>

      <el-form-item
        label="M3U8"
        :label-width="formLabelWidth"
      >
        <el-input
          v-model="download.m3u8"
        ></el-input>
      </el-form-item>

      <el-form-item
        label="Save name"
        :label-width="formLabelWidth"
      >
        <el-input
          ref="saveNameInput"
          v-model="download.saveName"
        ></el-input>
      </el-form-item>

      <el-form-item
        :label="$t('_save_to')"
        :label-width="formLabelWidth"
      >
        <directory-selector
          v-model="download.saveTo"
        ></directory-selector>
      </el-form-item>
    </el-form>
    <span
      slot="footer"
      class="dialog-footer"
    >
      <el-button
        @click="$emit('update:show', false)"
        size="mini"
      >{{ $t('_cancel') }}</el-button>
      <el-button
        type="primary"
        @click="addDownload"
        size="mini"
      >{{ $t('_add') }}</el-button>
    </span>
  </el-dialog>
</template>

<script>
import { ipcRenderer, clipboard } from 'electron';
import DirectorySelector from '../DirectorySelector';
import UrlMatcher from '@/../utils/UrlMatcher';
import User from '@/../renderer/modules/User';

export default {
  components: {
    'directory-selector': DirectorySelector
  },

  props: {
    show: {
      required: true,
      type: Boolean,
      default: false
    }
  },

  data() {
    return {
      formLabelWidth: '80px',

      download: {
        url: '',
        m3u8: '',
        saveTo: '',
        saveName: ''
      },

      addDownloadRule: {
        //
      },

      checking: false
    };
  },

  beforeMount() {
    let text = clipboard.readText('selection').trim();

    if (UrlMatcher.isMatch(text)) {
      this.download.url = text;
    }

    this.download.saveTo = this.settings.saveTo;
  },

  mounted() {
    setImmediate(() => {
      this.$refs.urlInput.focus();
    });
  },

  methods: {
    addDownload() {
      this.$refs['addDownloadForm'].validate((valid) => {
        if (valid) {
          this.$emit('update:show', false);

          ipcRenderer.send('download-service', {
            action: 'createDownload',
            args: this.download
          });
        } else {
          return false;
        }
      });
    }
  }
}
</script>

<style lang="scss">
.add-download-dialog {
  .el-dialog__body {
    padding: 10px 20px;
  }
}
</style>
